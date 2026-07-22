'use client';

import { useState, useEffect } from 'react';
import { 
  Tags, 
  Trash2, 
  Pencil, 
  Plus, 
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', 
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', 
  '#64748b'
];

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Deletion modal states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState('');

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('获取标签数据失败');
      const data = await res.json();
      setTags(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const url = editingId ? `/api/tags/${editingId}` : '/api/tags';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
      });

      if (!res.ok) throw new Error('保存标签失败');
      
      toast.success(editingId ? '标签已更新' : '标签已创建');
      setName('');
      setColor(PRESET_COLORS[0]);
      setEditingId(null);
      fetchTags();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteClick = (id: string, tagName: string) => {
    setDeletingId(id);
    setDeletingName(tagName);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      const res = await fetch(`/api/tags/${deletingId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || '删除失败');
      }
      toast.success('已删除');
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      setDeletingName('');
      fetchTags();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color || PRESET_COLORS[0]);
    // Focus the input
    const inputEl = document.getElementById('tag-name-input');
    if (inputEl) {
      inputEl.focus();
    }
  };

  // Convert Hex to RGBA helper for smooth background styling
  const getLightColor = (hex: string | null, opacity: number = 0.08) => {
    if (!hex) return `rgba(100, 116, 139, ${opacity})`;
    if (hex.startsWith('#')) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return hex;
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 dark:from-purple-500/5 dark:to-indigo-500/5 border border-purple-500/20 dark:border-purple-500/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)] shrink-0">
            <Tags className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">标签管理</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              创建与整理课件标签体系，便于进行精细化的内容筛选与归类。
            </p>
          </div>
        </div>
        {/* Stats */}
        <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm shrink-0 min-w-[90px]">
          <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">标签总数</div>
          <div className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums">{tags.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Form Panel */}
        <div className={`col-span-1 border rounded-2xl p-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm relative overflow-hidden transition-all duration-300 ${
          editingId 
            ? 'border-purple-500 ring-2 ring-purple-500/20 dark:ring-purple-500/10 shadow-[0_0_25px_rgba(168,85,247,0.12)]' 
            : 'border-slate-200/80 dark:border-slate-800 shadow-sm'
        }`}>
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-purple-400 to-indigo-500" />
          <h2 className="font-semibold text-lg mb-5 text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span>{editingId ? '编辑标签' : '新增标签'}</span>
            {editingId && (
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md animate-pulse">
                编辑模式
              </span>
            )}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="tag-name-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                标签名称
              </Label>
              <Input
                id="tag-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：初学者"
                className="focus-visible:ring-purple-500 focus-visible:border-purple-500 dark:bg-slate-950 transition-all rounded-xl"
                required
              />
            </div>
            <div className="space-y-2.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                标签配色
              </Label>
              <div className="flex flex-wrap gap-2.5 p-1 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800/50">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition-all duration-300 border-2 ${
                      color === c 
                        ? 'scale-110 border-white dark:border-slate-900 ring-2 ring-purple-500 ring-offset-2 dark:ring-offset-slate-900' 
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white transition-colors rounded-xl font-semibold text-sm h-10"
              >
                {editingId ? '保存更改' : '添加标签'}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setName('');
                    setColor(PRESET_COLORS[0]);
                  }}
                  className="px-4 border-slate-200 dark:border-slate-800 rounded-xl"
                >
                  取消
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* List Panel */}
        <div className="col-span-1 md:col-span-2 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm min-h-[300px]">
          <h2 className="font-semibold text-lg mb-5 text-slate-800 dark:text-slate-200">标签池</h2>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              <span>加载数据中...</span>
            </div>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2 border-2 border-dashed border-slate-100 dark:border-slate-800/80 rounded-xl">
              <Tags className="w-8 h-8 opacity-20" />
              <span>暂无标签，请在左侧创建</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {tags.map((tag) => (
                <div 
                  key={tag.id} 
                  className="group relative flex items-center pl-4 pr-12 py-2 border rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-all duration-300 select-none overflow-hidden shrink-0"
                  style={{ 
                    backgroundColor: getLightColor(tag.color, 0.08), 
                    borderColor: tag.color ? `${tag.color}25` : 'rgba(100, 116, 139, 0.15)' 
                  }}
                >
                  {/* Indicator Dot */}
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 mr-2.5" style={{ backgroundColor: tag.color || '#64748b' }} />
                  
                  {/* Tag Name */}
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {tag.name}
                  </span>

                  {/* Actions Drawer (Fades In) */}
                  <div className="absolute right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl p-1 border border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                    <button 
                      onClick={() => startEdit(tag)} 
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="编辑标签"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => handleDeleteClick(tag.id, tag.name)} 
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="删除标签"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setDeleteConfirmOpen(false)} />
          
          {/* Modal Body */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 to-purple-500" />
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 mx-auto mb-4 shadow-sm border border-purple-500/20">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">确定删除标签？</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                确定要删除标签 <span className="font-bold text-purple-600 dark:text-purple-400">“{deletingName}”</span> 吗？此操作将永久移除该数据，无法撤销。
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeletingId(null);
                  setDeletingName('');
                }}
                className="border-slate-200 dark:border-slate-800 rounded-xl h-9 text-xs"
              >
                取消
              </Button>
              <Button
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-9 text-xs font-semibold shadow-sm transition-colors"
              >
                确定删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
