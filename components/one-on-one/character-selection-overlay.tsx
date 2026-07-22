'use client';

import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { Swords, X, ChevronLeft, ChevronRight, Info, ArrowRight, RefreshCw, UserCircle2, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import useEmblaCarousel from 'embla-carousel-react';
import { cn } from '@/lib/utils';
import { asset } from '@/lib/branding';
import type { 
  TrainingTemplateOption, 
  TrainingStartConfig, 
  TrainingRoleConfig 
} from '../chat/training-config-modal';

interface CharacterSelectionOverlayProps {
  open: boolean;
  defaultConfig: TrainingRoleConfig | null;
  loading?: boolean;
  onStart: (config: TrainingStartConfig) => void;
  onClose: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

// Predefined avatar map with categorized assets (wrapped with asset helper)
const AVATAR_POOL = [
  '/avatars/thinker-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/teacher-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/assist-2.png',
  '/avatars/student1.svg',
  '/avatars/student2.svg',
  '/avatars/student3.svg',
  '/avatars/scholar.svg',
  '/avatars/explorer.svg',
  '/avatars/creative.svg',
  '/avatars/builder.svg',
  '/avatars/coder.svg',
].map(p => asset(p));

interface NamedDisplayItem {
  name: string;
}

const carouselContainerStyle = {
  '--slide-size': '380px',
  '--slide-spacing': '2rem',
} as CSSProperties;

function namedItems(value: unknown): NamedDisplayItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null || !('name' in item)) return null;
      const name = (item as { name?: unknown }).name;
      return typeof name === 'string' && name.trim() ? { name: name.trim() } : null;
    })
    .filter((item): item is NamedDisplayItem => item !== null);
}

/** 
 * Heuristic to pick a suitable avatar based on character info 
 */
function getBestAvatar(option: TrainingTemplateOption, index: number): string {
  const name = option.aiRole.name.toLowerCase();
  const desc = (option.description || '').toLowerCase();
  
  if (name.includes('学') || desc.includes('学')) return AVATAR_POOL[6 + (index % 3)]; // students
  if (name.includes('师') || desc.includes('教')) return AVATAR_POOL[3]; // teacher
  if (name.includes('工') || name.includes('造')) return AVATAR_POOL[12]; // builder
  if (name.includes('码') || name.includes('程序')) return AVATAR_POOL[13]; // coder
  
  return AVATAR_POOL[index % AVATAR_POOL.length];
}

export function CharacterSelectionOverlay({
  open,
  defaultConfig,
  loading,
  onStart,
  onClose,
  onRegenerate,
  regenerating,
}: CharacterSelectionOverlayProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'center',
    skipSnaps: false,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  // If no template options, create a virtual one from the default aiRole
  const templateOptions = useMemo(() => {
    if (defaultConfig?.templateOptions && defaultConfig.templateOptions.length > 0) {
      return defaultConfig.templateOptions;
    }
    if (defaultConfig?.aiRole) {
      return [{
        id: 'default',
        label: defaultConfig.aiRole.name,
        description: defaultConfig.aiRole.description,
        aiRole: defaultConfig.aiRole,
        background: defaultConfig.background,
        aiFirstMessage: defaultConfig.aiFirstMessage,
        scoringDimensions: defaultConfig.scoringDimensions,
        knowledgePoints: defaultConfig.knowledgePoints,
      } as TrainingTemplateOption];
    }
    return [];
  }, [defaultConfig]);

  // Automatically scroll to the middle card when options load or change
  useEffect(() => {
    if (!emblaApi || templateOptions.length === 0) return;
    const middleIndex = Math.floor(templateOptions.length / 2);
    // Use jump (true) so it centers instantly on initial render without a weird slide-in
    emblaApi.scrollTo(middleIndex, true);
    queueMicrotask(() => setSelectedIndex(middleIndex));
  }, [emblaApi, templateOptions]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    queueMicrotask(onSelect);
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  const handleStart = useCallback(() => {
    if (!defaultConfig || templateOptions.length === 0) return;
    const option = templateOptions[selectedIndex];
    
    onStart({
      background: option.background || defaultConfig.background,
      userRole: defaultConfig.userRole,
      aiRole: option.aiRole,
      whoSpeaksFirst: defaultConfig.whoSpeaksFirst,
      aiFirstMessage: option.aiFirstMessage || defaultConfig.aiFirstMessage,
      personality: option.label,
      globalConfig: defaultConfig.globalConfig,
      selectedTemplateId: option.id,
      templateOptions: defaultConfig.templateOptions,
      scoringDimensions: option.scoringDimensions || defaultConfig.scoringDimensions,
      knowledgePoints: option.knowledgePoints || defaultConfig.knowledgePoints,
    });
  }, [defaultConfig, templateOptions, selectedIndex, onStart]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gray-950 text-white overflow-hidden"
    >
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-orange-600/10 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="absolute top-0 inset-x-0 p-8 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Swords className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">实战对练配置</h2>
            <p className="text-xs text-gray-400">选择您的对战 AI 角色后开始</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={regenerating || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-full glass-morphism hover:bg-white/10 transition-all text-xs font-medium disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", regenerating && "animate-spin")} />
              {regenerating ? '生成中...' : '换一批角色'}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-morphism flex items-center justify-center hover:bg-white/20 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative w-full max-w-7xl mx-auto flex flex-col items-center justify-center py-12">
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
            <p className="text-gray-400 animate-pulse">正在为您生成专属陪练角色...</p>
          </div>
        ) : (
          <>
            {/* Carousel */}
            <div className="w-full relative px-12" style={{ perspective: '1000px' }}>
              <div className="overflow-visible" ref={emblaRef}>
                <div className="embla__container" style={carouselContainerStyle}>
                  {templateOptions.map((option, index) => {
                    const isActive = index === selectedIndex;
                    const avatar = getBestAvatar(option, index);
                    
                    return (
                      <div key={option.id} className="embla__slide flex items-center justify-center py-10">
                        <motion.div
                          animate={{
                            scale: isActive ? 1.05 : 0.85,
                            opacity: isActive ? 1 : 0.4,
                            rotateY: isActive ? 0 : (index < selectedIndex ? 15 : -15),
                            z: isActive ? 100 : 0
                          }}
                          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                          className={cn(
                            "relative w-full aspect-[3/4] rounded-[2.5rem] p-8 overflow-hidden transition-all duration-500",
                            "glass-morphism cursor-pointer group",
                            isActive && "glow-orange ring-2 ring-orange-500/50"
                          )}
                          onClick={() => emblaApi?.scrollTo(index)}
                        >
                          {/* Card Background Decoration */}
                          <div className={cn(
                            "absolute inset-0 bg-gradient-to-b from-transparent to-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                            isActive && "opacity-100"
                          )} />
                          
                          {/* Avatar */}
                          <div className="relative w-full h-48 mb-6 flex items-center justify-center">
                            <motion.img
                              animate={isActive ? { y: [0, -10, 0] } : {}}
                              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                              src={avatar}
                              alt={option.label}
                              className="w-40 h-40 object-contain drop-shadow-[0_20px_30px_rgba(245,158,11,0.3)]"
                            />
                            {isActive && (
                              <div className="absolute -inset-4 bg-orange-500/20 rounded-full blur-2xl animate-pulse" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="relative space-y-4">
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                                <Sparkles className="w-3 h-3" />
                                {option.aiRole.persona?.personalityType || '推荐性格'}
                              </span>
                              <h3 className="text-2xl font-black text-white leading-tight">{option.aiRole.name}</h3>
                            </div>
                            
                            <p className="text-sm text-gray-300 line-clamp-3 leading-relaxed font-medium">
                              {option.description}
                            </p>

                            {/* Gameplay Stats/Focus */}
                            <div className="py-1 space-y-2">
                              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <Target className="w-3.5 h-3.5 text-orange-500" />
                                <span>实战核心</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {namedItems(option.scoringDimensions).slice(0, 3).map((dim, i) => (
                                  <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 group-hover:border-orange-500/30 transition-colors">
                                    <Zap className="w-2.5 h-2.5 text-amber-500" />
                                    <span className="text-[10px] font-medium text-gray-300">{dim.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Knowledge Points */}
                            {namedItems(option.knowledgePoints).length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">要点考核</div>
                                <div className="flex flex-wrap gap-1">
                                  {namedItems(option.knowledgePoints).slice(0, 2).map((kp, i) => (
                                    <span key={i} className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-md font-medium">
                                      {kp.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Opening Preview */}
                            {option.aiFirstMessage && (
                              <div className="text-left bg-white/5 border border-white/5 rounded-xl p-2.5 relative">
                                <span className="absolute -top-1.5 left-3 px-1.5 bg-gray-900 text-[8px] font-bold text-amber-500/90 rounded border border-white/10">首句台词</span>
                                <p className="text-[11px] text-gray-300 italic line-clamp-1 mt-0.5">
                                  &ldquo;{option.aiFirstMessage}&rdquo;
                                </p>
                              </div>
                            )}

                            <div className="pt-2 flex flex-wrap gap-1.5">
                              {option.aiRole.persona?.debtAmount !== undefined && (
                                <div className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[9px] font-bold border border-red-500/20">
                                  欠款: {option.aiRole.persona.debtAmount.toLocaleString()} 元 ({option.aiRole.persona.debtDays || 0}天)
                                </div>
                              )}
                              {option.aiRole.persona?.monthlyPayment !== undefined && (
                                <div className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-bold border border-amber-500/20">
                                  月供: {option.aiRole.persona.monthlyPayment.toLocaleString()} 元
                                  {option.aiRole.persona.totalInstallments !== undefined && (
                                    <> / {option.aiRole.persona.totalInstallments}期</>
                                  )}
                                  {option.aiRole.persona.paidInstallments !== undefined && (
                                    <> 已还{option.aiRole.persona.paidInstallments}期</>
                                  )}
                                </div>
                              )}
                              {option.aiRole.persona?.age && (
                                <div className="px-2 py-0.5 rounded bg-white/5 text-[9px] font-medium border border-white/5">
                                  {option.aiRole.persona.age} 岁
                                </div>
                              )}
                              {option.aiRole.persona?.occupation && (
                                <div className="px-2 py-0.5 rounded bg-white/5 text-[9px] font-medium border border-white/5 truncate max-w-[120px]">
                                  {option.aiRole.persona.occupation}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action overlay on active card */}
                          {isActive && (
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="absolute bottom-8 right-8"
                            >
                              <button 
                                onClick={(e) => { e.stopPropagation(); setShowDetails(true); }}
                                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl"
                              >
                                <Info className="w-6 h-6" />
                              </button>
                            </motion.div>
                          )}
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Navigation Arrows */}
              <button
                onClick={scrollPrev}
                className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full glass-morphism flex items-center justify-center hover:bg-white/10 transition-all z-20 group"
              >
                <ChevronLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
              </button>
              <button
                onClick={scrollNext}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full glass-morphism flex items-center justify-center hover:bg-white/10 transition-all z-20 group"
              >
                <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Bottom Controls */}
            <div className="mt-12 flex flex-col items-center gap-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStart}
                className="group relative px-12 py-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-lg font-black shadow-[0_15px_30px_rgba(245,158,11,0.3)] overflow-hidden"
              >
                <div className="relative z-10 flex items-center gap-3">
                  <span>进入实战演练</span>
                  <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                </div>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </motion.button>
              
              <div className="flex items-center gap-8 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>AI 自动判分已就绪</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCircle2 className="w-4 h-4 text-blue-500" />
                  <span>当前身份：{defaultConfig?.userRole.name}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Panel Overlay */}
      <AnimatePresence>
        {showDetails && templateOptions[selectedIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-end p-8 bg-black/60 backdrop-blur-md"
            onClick={() => setShowDetails(false)}
          >
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="w-full max-w-lg h-full bg-gray-900 border-l border-white/10 p-10 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold">角色档案</h3>
                <button onClick={() => setShowDetails(false)} className="p-2 hover:bg-white/5 rounded-lg transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-8">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-2xl bg-white/5 flex items-center justify-center p-2">
                    <img src={getBestAvatar(templateOptions[selectedIndex], selectedIndex)} alt="avatar" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h4 className="text-3xl font-black">{templateOptions[selectedIndex].aiRole.name}</h4>
                    <p className="text-amber-500 font-bold uppercase tracking-widest text-xs mt-1">
                      {templateOptions[selectedIndex].aiRole.persona?.personalityType || 'Standard AI'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="text-sm font-bold text-gray-400 uppercase tracking-wider">角色描述</h5>
                  <p className="text-gray-200 leading-relaxed">{templateOptions[selectedIndex].aiRole.description}</p>
                </div>

                {templateOptions[selectedIndex].aiRole.persona && (
                  <div className="space-y-4">
                    <h5 className="text-sm font-bold text-gray-400 uppercase tracking-wider">背景详情</h5>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(templateOptions[selectedIndex].aiRole.persona || {}).map(([key, value]) => {
                        if (typeof value !== 'string' && typeof value !== 'number') return null;
                        if (key === 'personalityType' || key === 'behaviorTraits') return null;
                        const label =
                          (
                            {
                              age: '年龄',
                              gender: '性别',
                              occupation: '职业',
                              monthlyIncome: '月收入',
                              monthlyPayment: '月供金额',
                              totalInstallments: '总期数',
                              paidInstallments: '已还期数',
                              customerSituation: '客户情况',
                              debtAmount: '逾期金额',
                              debtDays: '逾期天数',
                              debtReason: '借款原因',
                              familyStatus: '家庭情况',
                              catchphrases: '口头禅',
                              closingPrompt: '结束话术',
                            } as Record<string, string>
                          )[key] || key;
                        return (
                          <div key={key} className="p-4 rounded-xl bg-white/5 border border-white/5">
                            <span className="block text-[10px] text-gray-500 uppercase mb-1">{label}</span>
                            <span className="text-sm font-bold text-gray-200">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-8">
                  <button
                    onClick={() => { handleStart(); setShowDetails(false); }}
                    className="w-full py-4 rounded-xl bg-white text-black font-bold hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    立即使用此角色
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
