'use client';

import { SlidersHorizontal, Target, Volume2 } from 'lucide-react';
import { CharacterTemplatePanel } from './character-template-panel';
import { ScoringConfigPanel } from './scoring-config-panel';
import { TtsVoicesMappingPanel } from './tts-voices-mapping-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function OneOnOneGlobalConfigPanel() {
  return (
    <Tabs defaultValue="scoring" className="space-y-6">
      <div className="flex border-b border-slate-200 dark:border-slate-800 pb-px">
        <TabsList variant="line" className="h-10 gap-6">
          <TabsTrigger
            value="scoring"
            className="text-sm font-medium gap-2 px-1 pb-3 pt-2 rounded-none data-active:border-b-2 data-active:border-blue-600 data-active:text-blue-600 dark:data-active:text-blue-400 dark:data-active:border-blue-400"
          >
            <Target className="w-4 h-4" />
            评分配置
          </TabsTrigger>
          <TabsTrigger
            value="character"
            className="text-sm font-medium gap-2 px-1 pb-3 pt-2 rounded-none data-active:border-b-2 data-active:border-blue-600 data-active:text-blue-600 dark:data-active:text-blue-400 dark:data-active:border-blue-400"
          >
            <SlidersHorizontal className="w-4 h-4" />
            AI角色模板管理
          </TabsTrigger>
          <TabsTrigger
            value="tts-voices"
            className="text-sm font-medium gap-2 px-1 pb-3 pt-2 rounded-none data-active:border-b-2 data-active:border-blue-600 data-active:text-blue-600 dark:data-active:text-blue-400 dark:data-active:border-blue-400"
          >
            <Volume2 className="w-4 h-4" />
            语音映射配置
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="scoring" className="outline-none focus:outline-none mt-2">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">评分配置</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                管理一对一陪练按标签生效的评分指标
              </p>
            </div>
          </div>

          <div className="p-6">
            <ScoringConfigPanel />
          </div>
        </section>
      </TabsContent>

      <TabsContent value="character" className="outline-none focus:outline-none mt-2">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">AI角色模板管理</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                创建和管理一对一陪练的AI角色模板
              </p>
            </div>
          </div>

          <div className="p-6">
            <CharacterTemplatePanel />
          </div>
        </section>
      </TabsContent>

      <TabsContent value="tts-voices" className="outline-none focus:outline-none mt-2">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">语音映射配置</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                管理音色 ID 映射到的发音服务，角色关联音色时只需填音色 ID，自动路由底层提供商、接口和密钥
              </p>
            </div>
          </div>

          <div className="p-6">
            <TtsVoicesMappingPanel />
          </div>
        </section>
      </TabsContent>
    </Tabs>
  );
}

