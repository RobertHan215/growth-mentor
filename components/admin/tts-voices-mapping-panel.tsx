'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, Edit2, Plus, Volume2, Key, Globe, Eye, EyeOff, Loader2 } from 'lucide-react';

interface VoiceMapping {
  voiceId: string;
  providerId: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
}

const PROVIDERS = [
  { id: 'openai-tts', name: 'OpenAI TTS' },
  { id: 'azure-tts', name: 'Azure TTS' },
  { id: 'glm-tts', name: 'GLM TTS' },
  { id: 'qwen-tts', name: '阿里千问 TTS' },
  { id: 'elevenlabs-tts', name: 'ElevenLabs TTS' },
  { id: 'minimax-tts', name: 'Minimax TTS' },
  { id: 'custom-minimax-tts', name: 'MOSS TTS Nano' },
  { id: 'doubao-tts', name: '火山豆包 TTS' },
];

export function TtsVoicesMappingPanel() {
  const [mappings, setMappings] = useState<VoiceMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null means adding

  // Form State
  const [voiceId, setVoiceId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/default-provider-config');
      if (!res.ok) throw new Error('加载配置失败');
      const data = await res.json();
      setMappings(data.defaults?.ttsVoicesMap || []);
    } catch {
      toast.error('获取语音映射配置失败');
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingIndex(null);
    setVoiceId('');
    setProviderId('doubao-tts');
    setName('');
    setApiKey('');
    setBaseUrl('');
    setShowKey(false);
    setDialogOpen(true);
  };

  const openEditDialog = (item: VoiceMapping, index: number) => {
    setEditingIndex(index);
    setVoiceId(item.voiceId);
    setProviderId(item.providerId);
    setName(item.name || '');
    setApiKey(item.apiKey || '');
    setBaseUrl(item.baseUrl || '');
    setShowKey(false);
    setDialogOpen(true);
  };

  const handleSaveItem = async () => {
    const trimmedVoiceId = voiceId.trim();
    if (!trimmedVoiceId) {
      toast.error('请输入音色 ID');
      return;
    }
    if (!providerId) {
      toast.error('请选择 TTS 服务提供商');
      return;
    }

    // Check duplicate voiceId
    const isDuplicate = mappings.some(
      (item, idx) => item.voiceId === trimmedVoiceId && idx !== editingIndex
    );
    if (isDuplicate) {
      toast.error(`音色 ID "${trimmedVoiceId}" 已存在，不可重复添加`);
      return;
    }

    setSaving(true);
    try {
      const newItem: VoiceMapping = {
        voiceId: trimmedVoiceId,
        providerId,
        name: name.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      };

      let updatedList = [...mappings];
      if (editingIndex !== null) {
        updatedList[editingIndex] = newItem;
      } else {
        updatedList.push(newItem);
      }

      const res = await fetch('/api/admin/default-provider-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttsVoicesMap: updatedList }),
      });

      if (!res.ok) throw new Error('保存配置失败');
      
      const data = await res.json();
      setMappings(data.defaults?.ttsVoicesMap || []);
      toast.success(editingIndex !== null ? '更新映射成功' : '新增映射成功');
      setDialogOpen(false);
    } catch {
      toast.error('保存语音映射失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    const item = mappings[index];
    if (!confirm(`确定要删除音色 "${item.name || item.voiceId}" 的映射配置吗？`)) {
      return;
    }

    setSaving(true);
    try {
      const updatedList = mappings.filter((_, idx) => idx !== index);
      const res = await fetch('/api/admin/default-provider-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttsVoicesMap: updatedList }),
      });

      if (!res.ok) throw new Error('删除失败');

      const data = await res.json();
      setMappings(data.defaults?.ttsVoicesMap || []);
      toast.success('删除映射成功');
    } catch {
      toast.error('删除映射失败');
    } finally {
      setSaving(false);
    }
  };

  const getProviderName = (id: string) => {
    return PROVIDERS.find((p) => p.id === id)?.name || id;
  };

  return (
    <div className="space-y-4">
      {/* Header Action */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          已配置 <span className="font-semibold text-slate-700 dark:text-slate-300">{mappings.length}</span> 个音色映射。角色关联音色时，仅需填写/选择对应的音色 ID。
        </div>
        <Button onClick={openAddDialog} className="inline-flex items-center gap-2">
          <Plus className="w-4 h-4" />
          新增音色映射
        </Button>
      </div>

      {/* List / Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : mappings.length === 0 ? (
        <div className="text-center py-12 text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          暂无音色映射配置，点击右上角按钮进行添加。
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">音色名称/别名</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">音色 ID (Voice ID)</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">TTS 服务商</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">专属接口 (Base URL)</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">专属密钥 (API Key)</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {mappings.map((item, index) => (
                <tr key={`${item.voiceId}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {item.name || '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                    {item.voiceId}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                      <Volume2 className="w-3 h-3" />
                      {getProviderName(item.providerId)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                    {item.baseUrl ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-400" />
                        {item.baseUrl}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">使用全局默认</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {item.apiKey ? (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-mono">
                        <Key className="w-3 h-3" />
                        已配置 (******)
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">使用全局默认</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(item, index)}
                        className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                        title="编辑"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(index)}
                        disabled={saving}
                        className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? '编辑音色映射' : '新增音色映射'}</DialogTitle>
            <DialogDescription>
              配置音色 ID 映射到的发音服务，允许针对特定的音色指定独立的接口地址和密钥。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                音色 ID (Voice ID) *
              </label>
              <Input
                placeholder="例如：zh_female_changsheng 或 my-custom-voice"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                disabled={editingIndex !== null} // Prevent changing ID on edit
              />
              <p className="text-[10px] text-slate-400">
                AI 角色关联该音色时所使用的唯一标识，必须与服务商所要求的音色参数完全一致。
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                名称/别名 (可选)
              </label>
              <Input
                placeholder="例如：常青女声、叙事男声"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                TTS 服务商 *
              </label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择服务商" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                专属接口地址 (Base URL，可选)
              </label>
              <Input
                placeholder="不填则使用服务默认地址"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                专属接口密钥 (API Key，可选)
              </label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder={
                    providerId === 'doubao-tts'
                      ? '火山豆包需配置为 "X-Api-Key;X-Api-Resource-Id" 格式'
                      : '不填则使用服务默认密钥'
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {providerId === 'doubao-tts' && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-normal">
                  提示：火山豆包 V3 接口需要 X-Api-Key 与 X-Api-Resource-Id 参数。您可以填入：<code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono">密钥;资源ID</code>。不填则默认使用官方公开测试密钥与 <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono">seed-icl-2.0</code>。
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSaveItem} disabled={saving} className="inline-flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
