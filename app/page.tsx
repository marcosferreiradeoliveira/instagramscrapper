'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Play, Download, CheckCircle2, XCircle, Loader2, AlertCircle, Instagram, FileJson, FileSpreadsheet, Trash2, Key } from 'lucide-react';
import { APP_TITLE, APP_VERSION } from '@/lib/version';
import { isOpenAiApiKey, normalizeOpenAiApiKey } from '@/lib/openai';

type StageDecision = 'discard' | 'manual_review' | 'scrape_posts';
type PotentialLevel = 'baixo' | 'medio' | 'alto';
type StageSection = 'stage3' | 'stage6' | 'stage8' | 'stage9';

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

interface FollowupMessage {
  numero: number;
  mensagem: string;
  prova: string;
  cta: string;
}

interface MessagesBlock {
  mensagem_inicial: string;
  followups: FollowupMessage[];
}

interface FullAnalysis {
  diagnostico: string;
  maturidade_digital: string;
  potencial_comercial: string;
  dores_detectadas: string[];
  onde_perde_dinheiro: string[];
  programa_recomendado: string;
  messages: MessagesBlock;
}

interface SystemFinalOutput {
  lead: Record<string, unknown>;
  score: number;
  pre_analysis: Record<string, unknown>;
  decision: string;
  posts: unknown[];
  analysis: Record<string, unknown> | null;
  messages: MessagesBlock | null;
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
  businessConfidence: number | null;
  potentialLevel: PotentialLevel | null;
  recommendedPostsToScrape: number;
  classificationReason: string;
  evaluationSignals: string[];
  painPoints: string[];
  fullAnalysis: FullAnalysis | null;
  fullAnalysisError?: string | null;
  finalOutput: SystemFinalOutput | null;
  status: 'pending' | 'processing' | 'success' | 'not_found' | 'error';
  errorMessage?: string;
}

function extractUsernameFromInstagramLink(link: string): string | null {
  const match = link.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  return match?.[1] || null;
}

function getProfileForAnalysis(item: CompanyData): InstagramProfileData | null {
  if (item.profileData?.username) {
    return item.profileData;
  }
  if (!item.instagramLink) return null;

  const username = extractUsernameFromInstagramLink(item.instagramLink);
  if (!username) return null;

  return {
    username,
    nome_perfil: '',
    bio: '',
    seguidores: 0,
    seguindo: 0,
    total_posts: 0,
    link_bio: '',
    categoria: '',
    cidade: '',
    is_business: false
  };
}

function canRunFullAnalysis(item: CompanyData): boolean {
  if (item.status !== 'success' || !item.instagramLink) return false;
  if (!item.decision || item.decision === 'discard') return false;
  if (!getProfileForAnalysis(item)) return false;
  return !item.fullAnalysis;
}

function needsFullAnalysis(item: CompanyData, openAiKey: string): boolean {
  return isOpenAiApiKey(openAiKey) && canRunFullAnalysis(item);
}

function shouldProcessRow(item: CompanyData, openAiKey: string): boolean {
  if (item.status === 'pending' || item.status === 'error') return true;
  return needsFullAnalysis(item, openAiKey);
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
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<number | null>(null);
  const [activeStageSection, setActiveStageSection] = useState<StageSection>('stage3');
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

    const invalidTokens = new Set(['null', 'undefined', 'none', 'n/a', 'na', '-', '--', '.']);
    if (invalidTokens.has(raw.toLowerCase())) return null;

    raw = raw.replace(/^@+/, '');
    raw = raw.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '');

    if (!raw) return null;
    if (invalidTokens.has(raw.toLowerCase())) return null;

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
        businessConfidence: null,
        potentialLevel: null,
        recommendedPostsToScrape: 0,
        classificationReason: '',
        evaluationSignals: [],
        painPoints: [],
        fullAnalysis: null,
        fullAnalysisError: null,
        finalOutput: null,
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

    const apiKey = normalizeOpenAiApiKey(openAiKey);
    let currentData = [...data];
    const rowIndices = currentData
      .map((_, index) => index)
      .filter((index) => shouldProcessRow(currentData[index], apiKey));

    if (rowIndices.length === 0) {
      const pendingAnalysis = currentData.filter((item) => canRunFullAnalysis(item)).length;
      setError(
        pendingAnalysis > 0 && !isOpenAiApiKey(apiKey)
          ? 'Chave OpenAI inválida. Cole uma chave que comece com sk- (painel OpenAI → API keys).'
          : 'Nenhuma linha pendente. Todos os leads já foram processados.'
      );
      setIsProcessing(false);
      return;
    }

    setProgress({ current: 0, total: rowIndices.length });
    let processedCount = 0;

    for (const i of rowIndices) {
      const analysisOnly = needsFullAnalysis(currentData[i], apiKey);
      const profileForAnalysis = getProfileForAnalysis(currentData[i]);

      currentData[i].status = 'processing';
      setData([...currentData]);

      try {
        const response = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            analysisOnly
              ? {
                  analysisOnly: true,
                  apiKey,
                  instagram: currentData[i].instagramLink,
                  profile: profileForAnalysis,
                  analysis: {
                    score: currentData[i].score ?? 0,
                    decision: currentData[i].decision ?? 'manual_review',
                    signals: currentData[i].evaluationSignals,
                    pain_points: currentData[i].painPoints
                  },
                  lead_classifier: {
                    decision: currentData[i].decision,
                    business_confidence: currentData[i].businessConfidence,
                    commercial_signals: currentData[i].evaluationSignals,
                    likely_pains: currentData[i].painPoints,
                    potential_level: currentData[i].potentialLevel,
                    recommended_posts_to_scrape: currentData[i].recommendedPostsToScrape,
                    reason: currentData[i].classificationReason
                  },
                  posts: []
                }
              : {
                  url: currentData[i].website,
                  apiKey,
                  instagramUrl: currentData[i].inputInstagram
                }
          )
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
            const classifier = result.lead_classifier || null;
            currentData[i].instagramLink = result.instagram;
            currentData[i].status = 'success';
            currentData[i].profileData = result.profile || null;
            currentData[i].score = typeof result.analysis?.score === 'number' ? result.analysis.score : null;
            currentData[i].decision = classifier?.decision || result.analysis?.decision || null;
            currentData[i].businessConfidence = typeof classifier?.business_confidence === 'number' ? classifier.business_confidence : null;
            currentData[i].potentialLevel = classifier?.potential_level || null;
            currentData[i].recommendedPostsToScrape = Number(classifier?.recommended_posts_to_scrape || 0);
            currentData[i].classificationReason = classifier?.reason || '';
            currentData[i].evaluationSignals = Array.isArray(classifier?.commercial_signals)
              ? classifier.commercial_signals
              : Array.isArray(result.analysis?.signals)
                ? result.analysis.signals
                : [];
            currentData[i].painPoints = Array.isArray(classifier?.likely_pains)
              ? classifier.likely_pains
              : Array.isArray(result.analysis?.pain_points)
                ? result.analysis.pain_points
                : [];
            currentData[i].fullAnalysis =
              result.full_analysis && typeof result.full_analysis === 'object'
                ? (result.full_analysis as FullAnalysis)
                : null;
            currentData[i].fullAnalysisError =
              typeof result.full_analysis_error === 'string' ? result.full_analysis_error : null;
            currentData[i].finalOutput =
              result.final_output && typeof result.final_output === 'object'
                ? (result.final_output as SystemFinalOutput)
                : null;
            currentData[i].errorMessage = undefined;
          } else if (currentData[i].inputInstagram) {
            currentData[i].instagramLink = currentData[i].inputInstagram;
            currentData[i].status = 'success';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].businessConfidence = null;
            currentData[i].potentialLevel = null;
            currentData[i].recommendedPostsToScrape = 0;
            currentData[i].classificationReason = '';
            currentData[i].evaluationSignals = [];
            currentData[i].painPoints = [];
            currentData[i].fullAnalysis = null;
            currentData[i].finalOutput = null;
            currentData[i].errorMessage = undefined;
          } else {
            currentData[i].status = 'not_found';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].businessConfidence = null;
            currentData[i].potentialLevel = null;
            currentData[i].recommendedPostsToScrape = 0;
            currentData[i].classificationReason = '';
            currentData[i].evaluationSignals = [];
            currentData[i].painPoints = [];
            currentData[i].fullAnalysis = null;
            currentData[i].finalOutput = null;
          }
        } else {
          if (currentData[i].inputInstagram) {
            currentData[i].instagramLink = currentData[i].inputInstagram;
            currentData[i].status = 'success';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].businessConfidence = null;
            currentData[i].potentialLevel = null;
            currentData[i].recommendedPostsToScrape = 0;
            currentData[i].classificationReason = '';
            currentData[i].evaluationSignals = [];
            currentData[i].painPoints = [];
            currentData[i].fullAnalysis = null;
            currentData[i].finalOutput = null;
            currentData[i].errorMessage = undefined;
          } else {
            currentData[i].status = 'error';
            currentData[i].errorMessage = result.error || 'Erro desconhecido';
            currentData[i].profileData = null;
            currentData[i].score = null;
            currentData[i].decision = null;
            currentData[i].businessConfidence = null;
            currentData[i].potentialLevel = null;
            currentData[i].recommendedPostsToScrape = 0;
            currentData[i].classificationReason = '';
            currentData[i].evaluationSignals = [];
            currentData[i].painPoints = [];
            currentData[i].fullAnalysis = null;
            currentData[i].finalOutput = null;
          }
        }
      } catch (err: any) {
        if (currentData[i].inputInstagram) {
          currentData[i].instagramLink = currentData[i].inputInstagram;
          currentData[i].status = 'success';
          currentData[i].profileData = null;
          currentData[i].score = null;
          currentData[i].decision = null;
          currentData[i].businessConfidence = null;
          currentData[i].potentialLevel = null;
          currentData[i].recommendedPostsToScrape = 0;
          currentData[i].classificationReason = '';
          currentData[i].evaluationSignals = [];
          currentData[i].painPoints = [];
          currentData[i].fullAnalysis = null;
          currentData[i].finalOutput = null;
          currentData[i].errorMessage = undefined;
        } else {
          currentData[i].status = 'error';
          currentData[i].errorMessage = err.message || 'Erro de rede';
          currentData[i].profileData = null;
          currentData[i].score = null;
          currentData[i].decision = null;
          currentData[i].businessConfidence = null;
          currentData[i].potentialLevel = null;
          currentData[i].recommendedPostsToScrape = 0;
          currentData[i].classificationReason = '';
          currentData[i].evaluationSignals = [];
          currentData[i].painPoints = [];
          currentData[i].fullAnalysis = null;
          currentData[i].finalOutput = null;
        }
      }

      processedCount += 1;
      setProgress({ current: processedCount, total: rowIndices.length });
      setData([...currentData]);

      // Delay to avoid hammering external servers
      await new Promise(res => setTimeout(res, analysisOnly ? 300 : 500));
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
      'etapa3_business_confidence': item.businessConfidence ?? '',
      'etapa3_potential_level': item.potentialLevel || '',
      'etapa3_recommended_posts_to_scrape': item.recommendedPostsToScrape,
      'etapa3_reason': item.classificationReason,
      'etapa3_sinais': item.evaluationSignals.join(', '),
      'etapa3_dores': item.painPoints.join(', '),
      'analise_diagnostico': item.fullAnalysis?.diagnostico ?? '',
      'analise_maturidade_digital': item.fullAnalysis?.maturidade_digital ?? '',
      'analise_potencial_comercial': item.fullAnalysis?.potencial_comercial ?? '',
      'analise_dores_detectadas': item.fullAnalysis?.dores_detectadas?.join(', ') ?? '',
      'analise_onde_perde_dinheiro': item.fullAnalysis?.onde_perde_dinheiro?.join(', ') ?? '',
      'analise_programa_recomendado': item.fullAnalysis?.programa_recomendado ?? '',
      'mensagem_inicial': item.fullAnalysis?.messages?.mensagem_inicial ?? '',
      'followups_json': JSON.stringify(item.fullAnalysis?.messages?.followups ?? []),
      'output_final_json': JSON.stringify(item.finalOutput ?? null)
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
    setSelectedEvaluationId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const decisionLabelMap: Record<StageDecision, string> = {
    discard: 'descartar',
    manual_review: 'revisão manual',
    scrape_posts: 'scrape posts'
  };
  const stageSectionLabels: Record<StageSection, string> = {
    stage3: 'Etapa 3 - Pré-análise',
    stage6: 'Etapa 6 - Análise completa',
    stage8: 'Etapa 8 - Mensagens',
    stage9: 'Etapa 9 - Output final'
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
        if ((errorMessage || '').includes('403')) {
          return (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#ffedd5] text-[#9a3412]"
              title={errorMessage}
            >
              Bloqueado (403)
            </span>
          );
        }
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#fee2e2] text-[#991b1b]" title={errorMessage}>Erro: {errorMessage}</span>;
    }
  };

  const successCount = data.filter(d => d.status === 'success').length;
  const normalizedOpenAiKey = normalizeOpenAiApiKey(openAiKey);
  const openAiKeyValid = isOpenAiApiKey(normalizedOpenAiKey);
  const pendingAnalysisCount = data.filter((item) => canRunFullAnalysis(item)).length;
  const runnableCount = data.filter((item) => shouldProcessRow(item, normalizedOpenAiKey)).length;
  const completionPercentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const selectedEvaluationItem =
    data.find(item => item.id === selectedEvaluationId) ||
    data.find(item => item.score !== null) ||
    null;

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] text-[#1e293b] font-sans overflow-hidden">
      {/* Top Bar */}
      <div className="h-16 bg-[#ffffff] border-b border-[#e2e8f0] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2.5 font-bold text-lg text-[#2563eb]">
          <Instagram className="w-6 h-6" />
          <span>{APP_TITLE}</span>
          <span
            className="font-semibold text-[11px] text-[#64748b] bg-[#f1f5f9] border border-[#e2e8f0] px-2 py-0.5 rounded-full"
            title={`Versão ${APP_VERSION}`}
          >
            v{APP_VERSION}
          </span>
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
              Necessária para extração no site, classificador (camada 2) e análise completa (camada 6). Descartes não disparam a análise completa (economia).
            </span>
            {normalizedOpenAiKey && (
              <span className={`text-[10px] font-medium ${openAiKeyValid ? 'text-[#15803d]' : 'text-[#b45309]'}`}>
                {openAiKeyValid
                  ? 'Chave reconhecida — etapas 6–8 habilitadas.'
                  : 'Formato inválido: use uma chave OpenAI que comece com sk- (não é URL nem senha do app).'}
              </span>
            )}
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
            {pendingAnalysisCount > 0 && (
              <button
                type="button"
                onClick={processLinks}
                disabled={isProcessing || !openAiKeyValid}
                title={openAiKeyValid ? undefined : 'Informe uma chave OpenAI válida (sk-...)'}
                className="bg-[#0f766e] text-white border-none p-3 rounded-lg font-semibold text-sm cursor-pointer transition-colors hover:bg-[#0d9488] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Gerando análises...</>
                ) : (
                  <><Play className="w-4 h-4" /> Completar análises (IA) ({pendingAnalysisCount})</>
                )}
              </button>
            )}
            <button 
              onClick={processLinks}
              disabled={isProcessing || data.length === 0 || runnableCount === 0}
              className="bg-[#2563eb] text-white border-none p-3 rounded-lg font-semibold text-sm cursor-pointer transition-colors hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
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
                    <div
                      key={item.id}
                      onClick={() => setSelectedEvaluationId(item.id)}
                      className={`px-4 py-3.5 border-b border-[#e2e8f0] grid grid-cols-[1fr_4fr_3fr] gap-4 items-center text-[13px] hover:bg-[#f8fafc] transition-colors last:border-b-0 cursor-pointer ${selectedEvaluationItem?.id === item.id ? 'bg-[#eff6ff]' : ''}`}
                    >
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

          <div className="bg-[#ffffff] rounded-xl border border-[#e2e8f0] p-4 shrink-0 max-h-[240px] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-[#1e293b]">Seções por etapas</h3>
              {selectedEvaluationItem?.score !== null && selectedEvaluationItem?.decision && (
                <span className="text-xs text-[#64748b]">
                  Score {selectedEvaluationItem.score} - {decisionLabelMap[selectedEvaluationItem.decision]}
                </span>
              )}
            </div>

            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {(Object.keys(stageSectionLabels) as StageSection[]).map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveStageSection(section)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap border transition-colors ${
                    activeStageSection === section
                      ? 'bg-[#2563eb] text-white border-[#2563eb]'
                      : 'bg-white text-[#334155] border-[#e2e8f0] hover:bg-[#f8fafc]'
                  }`}
                >
                  {stageSectionLabels[section]}
                </button>
              ))}
            </div>

            {!selectedEvaluationItem ? (
              <p className="text-xs text-[#64748b]">Selecione uma linha processada para ver os detalhes da etapa.</p>
            ) : activeStageSection === 'stage3' ? (
              <div className="grid grid-cols-2 gap-3 text-xs text-[#334155]">
                <div><b>Instagram:</b> {selectedEvaluationItem.instagramLink || '-'}</div>
                <div><b>Username:</b> {selectedEvaluationItem.profileData?.username || '-'}</div>
                <div><b>Confiança negócio:</b> {selectedEvaluationItem.businessConfidence ?? '-'}</div>
                <div><b>Potencial:</b> {selectedEvaluationItem.potentialLevel || '-'}</div>
                <div><b>Nome perfil:</b> {selectedEvaluationItem.profileData?.nome_perfil || '-'}</div>
                <div><b>Categoria:</b> {selectedEvaluationItem.profileData?.categoria || '-'}</div>
                <div><b>Seguidores:</b> {selectedEvaluationItem.profileData?.seguidores ?? 0}</div>
                <div><b>Seguindo:</b> {selectedEvaluationItem.profileData?.seguindo ?? 0}</div>
                <div><b>Total posts:</b> {selectedEvaluationItem.profileData?.total_posts ?? 0}</div>
                <div><b>Business:</b> {selectedEvaluationItem.profileData?.is_business ? 'sim' : 'não'}</div>
                <div><b>Posts recomendados:</b> {selectedEvaluationItem.recommendedPostsToScrape}</div>
                <div className="col-span-2"><b>Cidade:</b> {selectedEvaluationItem.profileData?.cidade || '-'}</div>
                <div className="col-span-2"><b>Link bio:</b> {selectedEvaluationItem.profileData?.link_bio || '-'}</div>
                <div className="col-span-2"><b>Bio:</b> {selectedEvaluationItem.profileData?.bio || '-'}</div>
                <div className="col-span-2"><b>Motivo:</b> {selectedEvaluationItem.classificationReason || '-'}</div>
                <div className="col-span-2">
                  <b>Sinais positivos:</b>{' '}
                  {selectedEvaluationItem.evaluationSignals.length > 0 ? selectedEvaluationItem.evaluationSignals.join(', ') : 'nenhum sinal detectado'}
                </div>
                <div className="col-span-2">
                  <b>Dores prováveis:</b>{' '}
                  {selectedEvaluationItem.painPoints.length > 0 ? selectedEvaluationItem.painPoints.join(', ') : 'nenhuma dor detectada'}
                </div>
              </div>
            ) : activeStageSection === 'stage6' ? (
              selectedEvaluationItem.decision === 'discard' ? (
                <p className="text-xs text-[#64748b]">Lead descartado: análise completa não é executada (economia de custo).</p>
              ) : !openAiKeyValid ? (
                <p className="text-xs text-[#b45309]">
                  {normalizedOpenAiKey
                    ? 'A chave no painel lateral não está no formato OpenAI (deve começar com sk-). Gere em platform.openai.com → API keys.'
                    : 'Informe a OpenAI API Key (sk-...) no painel lateral.'}
                  {pendingAnalysisCount > 0 && ' Depois clique em Completar análises (IA).'}
                </p>
              ) : selectedEvaluationItem.fullAnalysisError ? (
                <p className="text-xs text-[#b91c1c]">
                  Análise completa falhou: {selectedEvaluationItem.fullAnalysisError}
                </p>
              ) : !selectedEvaluationItem.fullAnalysis ? (
                <p className="text-xs text-[#64748b]">
                  Análise completa ainda não gerada.
                  {pendingAnalysisCount > 0 ? (
                    <> Use o botão verde <b>Completar análises (IA) ({pendingAnalysisCount})</b> na barra lateral.</>
                  ) : (
                    <> Rode <b>Iniciar Varredura</b> com a API key preenchida.</>
                  )}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 text-xs text-[#334155]">
                  <div><b>Diagnóstico:</b> {selectedEvaluationItem.fullAnalysis.diagnostico || '—'}</div>
                  <div><b>Maturidade digital:</b> {selectedEvaluationItem.fullAnalysis.maturidade_digital || '—'}</div>
                  <div><b>Potencial comercial:</b> {selectedEvaluationItem.fullAnalysis.potencial_comercial || '—'}</div>
                  <div><b>Dores detectadas:</b> {selectedEvaluationItem.fullAnalysis.dores_detectadas?.join(', ') || '—'}</div>
                  <div><b>Onde perde dinheiro:</b> {selectedEvaluationItem.fullAnalysis.onde_perde_dinheiro?.join(', ') || '—'}</div>
                  <div><b>Programa recomendado:</b> {selectedEvaluationItem.fullAnalysis.programa_recomendado || '—'}</div>
                </div>
              )
            ) : activeStageSection === 'stage8' ? (
              !selectedEvaluationItem.fullAnalysis?.messages ? (
                <p className="text-xs text-[#64748b]">Sem mensagens geradas (depende da análise completa com API key).</p>
              ) : (
                <div className="text-xs text-[#334155] space-y-2">
                  <div><b>Mensagem inicial:</b> {selectedEvaluationItem.fullAnalysis.messages.mensagem_inicial || '—'}</div>
                  <div className="font-semibold text-[#64748b]">Follow-ups</div>
                  {(selectedEvaluationItem.fullAnalysis.messages.followups || []).length === 0 ? (
                    <span>—</span>
                  ) : (
                    <ul className="space-y-2 pl-0 list-none">
                      {selectedEvaluationItem.fullAnalysis.messages.followups.map((fu) => (
                        <li key={fu.numero} className="pl-2 border-l-2 border-[#2563eb]/30">
                          <span className="text-[#64748b]">#{fu.numero}</span>
                          <div className="mt-0.5"><b>Msg:</b> {fu.mensagem}</div>
                          <div><b>Prova:</b> {fu.prova || '—'}</div>
                          <div><b>CTA:</b> {fu.cta || '—'}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            ) : !selectedEvaluationItem.finalOutput ? (
              <p className="text-xs text-[#64748b]">Sem payload agregado (ex.: lead descartado ou sem API key).</p>
            ) : (
              <pre className="text-[10px] leading-relaxed text-[#334155] whitespace-pre-wrap break-words font-mono bg-[#f8fafc] p-2 rounded border border-[#e2e8f0]">
                {JSON.stringify(selectedEvaluationItem.finalOutput, null, 2)}
              </pre>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
