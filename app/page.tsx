'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Play, Download, CheckCircle2, XCircle, Loader2, AlertCircle, Instagram, FileJson, FileSpreadsheet, Trash2, Key } from 'lucide-react';

type StageDecision = 'discard' | 'manual_review' | 'next_stage';

interface InstagramProfileData {
  username: string;
  nome_perfil: string;
  bio: string;
  seguidores: number;
  seguindo: number;
  total_posts: number;
  link_bio: string;
  categoria: string;
  cidade: string;
  is_business: boolean;
}

interface CompanyData {
  id: number;
  originalRow: any;
  website: string;
  inputInstagram: string | null;
  instagramLink: string | null;
  profileData: InstagramProfileData | null;
  score: number | null;
  decision: StageDecision | null;
  painPoints: string[];
  status: 'pending' | 'processing' | 'success' | 'not_found' | 'error';
  errorMessage?: string;
}

export default function Home() {
  const [data, setData] = useState<CompanyData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [siteColumn, setSiteColumn] = useState<string>('');
  const [instagramColumn, setInstagramColumn] = useState<string>('');
  const [openAiKey, setOpenAiKey] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem('ig_scout_openai_key');
    if (storedKey) setOpenAiKey(storedKey);
  }, []);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOpenAiKey(val);
    localStorage.setItem('ig_scout_openai_key', val);
  };

  const normalizeInstagramValue = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;

    let raw = String(value).trim();
    if (!raw) return null;

    raw = raw.replace(/^@+/, '');
    raw = raw.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '');

    if (!raw) return null;

    if (raw.toLowerCase().includes('instagram.com/')) {
      const withProtocol = raw.startsWith('http') ? raw : `https://${raw}`;
      const match = withProtocol.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
      if (!match?.[1]) return null;

      const lower = withProtocol.toLowerCase();
      const invalidPaths = ['/p/', '/reel/', '/explore/', '/about/', '/developer/', '/tags/', '/locations/', '/directory/'];
      if (invalidPaths.some(path => lower.includes(path))) return null;

      return `https://www.instagram.com/${match[1]}/`;
    }

    if (/^[a-zA-Z0-9._]{1,30}$/.test(raw)) {
      return `https://www.instagram.com/${raw}/`;
    }

    return null;
  };

  const mapRowsToCompanyData = (jsonData: any[], selectedSiteColumn: string, selectedInstagramColumn: string): CompanyData[] => {
    return jsonData
      .map((row, index) => ({
        id: index,
        originalRow: row,
        website: row[selectedSiteColumn] || '',
        inputInstagram: selectedInstagramColumn ? normalizeInstagramValue(row[selectedInstagramColumn]) : null,
        instagramLink: null,
        profileData: null,
        score: null,
        decision: null,
        painPoints: [],
        status: 'pending' as const
      }))
      .filter(item => {
        const hasWebsite = item.website !== null && item.website !== undefined && String(item.website).trim() !== '';
        return hasWebsite || !!item.inputInstagram;
      });
  };

  const getColumnKeys = (jsonData: any[]): string[] => {
    const keySet = new Set<string>();

    for (const row of jsonData) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        for (const key of Object.keys(row)) {
          keySet.add(key);
        }
      }
    }

    return Array.from(keySet);
  };

  const processDataArray = (jsonData: any[]) => {
    let siteColumnKey = '';
    let instagramColumnKey = '';
    
    if (jsonData.length > 0) {
      const keys = getColumnKeys(jsonData);
      setColumns(keys);
      
      // Auto-detect website column
      const possibleSiteKeys = ['website', 'site', 'url', 'link'];
      const foundSiteKey = keys.find(k => possibleSiteKeys.some(pk => k.toLowerCase().includes(pk)));

      // Auto-detect instagram column
      const possibleInstagramKeys = ['instagram', 'insta', 'ig'];
      const foundInstagramKey = keys.find(k => possibleInstagramKeys.some(ik => k.toLowerCase().includes(ik)));
      
      if (foundSiteKey) {
        setSiteColumn(foundSiteKey);
        siteColumnKey = foundSiteKey;
      } else if (keys.length > 0) {
        setSiteColumn(keys[0]);
        siteColumnKey = keys[0];
      }

      if (foundInstagramKey) {
        setInstagramColumn(foundInstagramKey);
        instagramColumnKey = foundInstagramKey;
      } else {
        setInstagramColumn('');
      }
    }

    const formattedData: CompanyData[] = mapRowsToCompanyData(jsonData, siteColumnKey, instagramColumnKey);

    if (formattedData.length === 0) {
      setError('Nenhum site ou instagram válido encontrado.');
      return;
    }

    setData(formattedData);
    setProgress({ current: 0, total: formattedData.length });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');
    setError(null);
    
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    if (fileExt === 'json') {
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          let jsonData = JSON.parse(text);
          if (!Array.isArray(jsonData)) {
            // If it's an object containing an array, or just an object
            jsonData = [jsonData];
          }
          processDataArray(jsonData);
        } catch (err) {
          setError('Erro ao processar o arquivo JSON. Verifique a estrutura.');
          console.error(err);
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
          processDataArray(jsonData);
        } catch (err) {
          setError('Erro ao processar o arquivo Excel.');
          console.error(err);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const updateSiteColumnSelection = (newColumn: string) => {
    setSiteColumn(newColumn);
    
    // Update existing mapped data to use the new column
    const updatedData = mapRowsToCompanyData(data.map(item => item.originalRow), newColumn, instagramColumn);

    setData(updatedData);
    setProgress({ current: 0, total: updatedData.length });
  };

  const updateInstagramColumnSelection = (newColumn: string) => {
    setInstagramColumn(newColumn);
    const updatedData = mapRowsToCompanyData(data.map(item => item.originalRow), siteColumn, newColumn);

    setData(updatedData);
    setProgress({ current: 0, total: updatedData.length });
  };

  const processLinks = async () => {
    setIsProcessing(true);
    setError(null);

    let currentData = [...data];

    for (let i = 0; i < currentData.length; i++) {
      if (currentData[i].status === 'success' || currentData[i].status === 'not_found') {
        continue;
      }

      currentData[i].status = 'processing';
      setData([...currentData]);

      try {
        const response = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            url: currentData[i].website,
            apiKey: openAiKey,
            instagramUrl: currentData[i].inputInstagram
          })
        });

        let result;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          result = await response.json();
        } else {
          // If the server returns HTML (like a 504 Gateway Timeout page), handle it
          throw new Error(`Erro de rede ou servidor (HTTP ${response.status}). O site pode ser muito lento.`);
        }

        if (response.ok) {
          if (result.instagram) {
            currentData[i].instagramLink = result.instagram;
            currentData[i].status = 'success';
            currentData[i].profileData = result.profile || null;
            currentData[i].score = typeof result.analysis?.score === 'number' ? result.analysis.score : null;
            currentData[i].decision = result.analysis?.decision || null;
            currentData[i].painPoints = Array.isArray(result.analysis?.pain_points) ? result.analysis.pain_points : [];
            currentData[i].errorMessage = undefined;
          } else if (currentData[i].inputInstagram) {
            currentData[i].instagramLink = currentData[i].inputInstagram;
            currentData[i].status = 'success';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].painPoints = [];
            currentData[i].errorMessage = undefined;
          } else {
            currentData[i].status = 'not_found';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].painPoints = [];
          }
        } else {
          if (currentData[i].inputInstagram) {
            currentData[i].instagramLink = currentData[i].inputInstagram;
            currentData[i].status = 'success';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].painPoints = [];
            currentData[i].errorMessage = undefined;
          } else {
            currentData[i].status = 'error';
            currentData[i].errorMessage = result.error || 'Erro desconhecido';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].painPoints = [];
          }
        }
      } catch (err: any) {
        if (currentData[i].inputInstagram) {
          currentData[i].instagramLink = currentData[i].inputInstagram;
          currentData[i].status = 'success';
          currentData[i].profileData = null;
          currentData[i].score = null;
          currentData[i].decision = null;
          currentData[i].painPoints = [];
          currentData[i].errorMessage = undefined;
        } else {
          currentData[i].status = 'error';
          currentData[i].errorMessage = err.message || 'Erro de rede';
          currentData[i].profileData = null;
          currentData[i].score = null;
          currentData[i].decision = null;
          currentData[i].painPoints = [];
        }
      }

      setProgress({ current: i + 1, total: currentData.length });
      setData([...currentData]);

      // Delay to avoid hammering external servers
      await new Promise(res => setTimeout(res, 500));
    }

    setIsProcessing(false);
  };

  const exportToExcel = () => {
    const exportData = data.map(item => ({
      ...item.originalRow,
      'Instagram Encontrado': item.instagramLink || (item.status === 'not_found' ? 'Não encontrado' : 'Erro'),
      'username': item.profileData?.username || '',
      'nome_perfil': item.profileData?.nome_perfil || '',
      'bio': item.profileData?.bio || '',
      'seguidores': item.profileData?.seguidores ?? 0,
      'seguindo': item.profileData?.seguindo ?? 0,
      'total_posts': item.profileData?.total_posts ?? 0,
      'link_bio': item.profileData?.link_bio || '',
      'categoria': item.profileData?.categoria || '',
      'cidade': item.profileData?.cidade || '',
      'is_business': item.profileData?.is_business ?? false,
      'etapa3_score': item.score ?? '',
      'etapa3_decisao': item.decision || '',
      'etapa3_dores': item.painPoints.join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados_Instagram');
    XLSX.writeFile(wb, 'Instagram_Scrapper_Resultados.xlsx');
  };

  const clearData = () => {
    setData([]);
    setProgress({ current: 0, total: 0 });
    setFileName(null);
    setFileSize(null);
    setError(null);
    setColumns([]);
    setSiteColumn('');
    setInstagramColumn('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const decisionLabelMap: Record<StageDecision, string> = {
    discard: 'descartar',
    manual_review: 'revisão manual',
    next_stage: 'próxima etapa'
  };

  const getStatusPill = (status: CompanyData['status'], instagramLink: string | null, errorMessage?: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#f1f5f9] text-[#475569]">Pendente</span>;
      case 'processing':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#fef9c3] text-[#854d0e]"><Loader2 className="w-3 h-3 animate-spin" /> Buscando...</span>;
      case 'success':
        return (
          <a href={instagramLink!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0] transition-colors">
            {instagramLink?.replace(/https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '')}
          </a>
        );
      case 'not_found':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#fee2e2] text-[#991b1b]">Não Encontrado</span>;
      case 'error':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#fee2e2] text-[#991b1b]" title={errorMessage}>Erro: {errorMessage}</span>;
    }
  };

  const successCount = data.filter(d => d.status === 'success').length;
  const completionPercentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] text-[#1e293b] font-sans overflow-hidden">
      {/* Top Bar */}
      <div className="h-16 bg-[#ffffff] border-b border-[#e2e8f0] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2.5 font-bold text-lg text-[#2563eb]">
          <Instagram className="w-6 h-6" />
          IG-Scout AI (Web Scraper)
        </div>
        <div className="text-sm text-[#64748b]">
          Logged in as <b className="text-[#1e293b]">Admin</b>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[300px] bg-[#ffffff] border-r border-[#e2e8f0] p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#64748b]">Upload de Arquivo</span>
            <div 
              className="border-2 border-dashed border-[#e2e8f0] rounded-xl p-8 text-center bg-[#f1f5f9] cursor-pointer transition-all duration-200 hover:border-[#2563eb] hover:bg-[#eff6ff]"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex justify-center gap-2 mb-2">
                <FileJson className="w-6 h-6 text-[#64748b]" />
                <FileSpreadsheet className="w-6 h-6 text-[#64748b]" />
              </div>
              {fileName ? (
                <>
                  <span className="text-[13px] font-medium block truncate px-2">{fileName}</span>
                  <div className="text-[11px] text-[#64748b] mt-1">{fileSize}</div>
                </>
              ) : (
                <>
                  <span className="text-[13px] font-medium block">Selecionar Arquivo</span>
                  <div className="text-[11px] text-[#64748b] mt-1">.json ou .xlsx</div>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".json, .xlsx, .xls" 
                className="hidden" 
              />
            </div>
            {error && (
              <div className="mt-2 text-xs text-red-600 flex items-start gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#64748b]">Coluna do Site</span>
            <select 
              className="p-2.5 rounded-md border border-[#e2e8f0] bg-[#ffffff] text-sm outline-none focus:border-[#2563eb]"
              value={siteColumn}
              onChange={(e) => updateSiteColumnSelection(e.target.value)}
              disabled={columns.length === 0 || isProcessing}
            >
              {columns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            <span className="text-[11px] text-[#64748b] mt-1">Selecione onde estão as URLs dos sites (ex: www.empresa.com.br)</span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#64748b]">Instagram (2a chance)</span>
            <select
              className="p-2.5 rounded-md border border-[#e2e8f0] bg-[#ffffff] text-sm outline-none focus:border-[#2563eb]"
              value={instagramColumn}
              onChange={(e) => updateInstagramColumnSelection(e.target.value)}
              disabled={columns.length === 0 || isProcessing}
            >
              <option value="">Nenhuma</option>
              {columns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            <span className="text-[11px] text-[#64748b] mt-1">Se a busca no site falhar, usa esta coluna (aceita @usuario, usuario ou URL).</span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#64748b] flex items-center gap-1">
              <Key className="w-3 h-3" /> OpenAI API Key (Opcional)
            </span>
            <input
              type="password"
              className="p-2.5 rounded-md border border-[#e2e8f0] bg-[#ffffff] text-sm outline-none focus:border-[#2563eb]"
              placeholder="sk-..."
              value={openAiKey}
              onChange={handleKeyChange}
              disabled={isProcessing}
            />
            <span className="text-[10px] text-[#64748b] leading-tight">
              Aumenta a precisão das buscas extraindo o link usando IA inteligente.
            </span>
          </div>

          <div className="mt-auto flex flex-col gap-3">
            {data.length > 0 && (
              <div className="flex gap-2">
                <button 
                  onClick={exportToExcel}
                  disabled={isProcessing || progress.current === 0}
                  className="flex-1 bg-[#ffffff] border border-[#e2e8f0] text-[#1e293b] p-3 rounded-lg font-semibold text-sm cursor-pointer transition-colors hover:bg-[#f8fafc] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Exportar Planilha
                </button>
                <button 
                  onClick={clearData}
                  disabled={isProcessing}
                  className="bg-[#ffffff] border border-[#e2e8f0] text-red-600 p-3 rounded-lg font-semibold text-sm cursor-pointer transition-colors hover:bg-red-50 disabled:opacity-50 flex items-center justify-center"
                  title="Clear Data"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <button 
              onClick={processLinks}
              disabled={isProcessing || data.length === 0 || progress.current === progress.total}
              className="bg-[#2563eb] text-white border-none p-3 rounded-lg font-semibold text-sm cursor-pointer transition-colors hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Buscando no Site...</>
              ) : (
                <><Play className="w-4 h-4" /> Iniciar Varredura</>
              )}
            </button>
          </div>
        </aside>

        {/* Main View */}
        <main className="flex-1 p-6 flex flex-col gap-5 overflow-hidden">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            <div className="bg-[#ffffff] p-4 rounded-xl border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="text-2xl font-bold text-[#2563eb]">{data.length}</div>
              <div className="text-xs text-[#64748b] mt-1">Sites a Processar</div>
            </div>
            <div className="bg-[#ffffff] p-4 rounded-xl border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="text-2xl font-bold text-[#2563eb]">{completionPercentage}%</div>
              <div className="text-xs text-[#64748b] mt-1">Progresso</div>
            </div>
            <div className="bg-[#ffffff] p-4 rounded-xl border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="text-2xl font-bold text-[#2563eb]">{successCount}</div>
              <div className="text-xs text-[#64748b] mt-1">Instagrams Encontrados</div>
            </div>
          </div>

          {/* Data Card */}
          <div className="bg-[#ffffff] rounded-xl border border-[#e2e8f0] flex-1 flex flex-col overflow-hidden">
            <div className="bg-[#f8fafc] px-4 py-3 border-b border-[#e2e8f0] grid grid-cols-[1fr_4fr_3fr] gap-4 text-xs font-semibold text-[#64748b] shrink-0">
              <span>LINHA</span>
              <span>SITE ALVO</span>
              <span>RESULTADO</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#64748b] p-8 text-center">
                  <div className="flex gap-2">
                    <FileJson className="w-12 h-12 mb-3 opacity-20" />
                  </div>
                  <p className="text-sm">Nenhum dado carregado.</p>
                  <p className="text-xs mt-1">Faça upload de um arquivo JSON (ou Excel) contendo URLs de sites.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {data.map((item, idx) => (
                    <div key={item.id} className="px-4 py-3.5 border-b border-[#e2e8f0] grid grid-cols-[1fr_4fr_3fr] gap-4 items-center text-[13px] hover:bg-[#f8fafc] transition-colors last:border-b-0">
                      <span className="font-medium text-[#1e293b]">
                        L-{idx + 1}
                      </span>
                      <a 
                        href={(String(item.website).startsWith('http') ? '' : 'http://') + item.website} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[#2563eb] no-underline whitespace-nowrap overflow-hidden text-ellipsis block hover:underline"
                        title={String(item.website)}
                      >
                        {String(item.website).replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                      <div>
                        {getStatusPill(item.status, item.instagramLink, item.errorMessage)}
                        {item.score !== null && item.decision && (
                          <div className="mt-1 text-[11px] text-[#64748b]">
                            Score {item.score} - {decisionLabelMap[item.decision]}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
