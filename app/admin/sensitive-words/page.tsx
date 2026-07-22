'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Trash2, 
  Pencil, 
  Plus, 
  X, 
  Search, 
  ShieldAlert, 
  Clock,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface SensitiveWord {
  id: string;
  word: string;
  category: string;
  enabled: boolean;
  createdAt: string;
}

// Derive unique categories from the word list
function getCategories(words: SensitiveWord[]): string[] {
  const cats = [...new Set(words.map((w) => w.category).filter(Boolean))];
  return cats.sort();
}

export default function SensitiveWordsPage() {
  const [words, setWords] = useState<SensitiveWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'true' | 'false'>('all');

  // Form state
  const [bulkInput, setBulkInput] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Drawer & Modal state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState('');

  const fetchWords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterEnabled !== 'all') params.set('enabled', filterEnabled);
      const res = await fetch(`/api/admin/sensitive-words?${params}`);
      if (!res.ok) throw new Error('加载敏感词数据失败');
      setWords(await res.json());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterEnabled]);

  useEffect(() => { 
    fetchWords(); 
  }, [fetchWords]);

  // ── Bulk add ──
  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const wordList = bulkInput
      .split(/[\n,，；;]/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (wordList.length === 0) {
      toast.error('请输入至少一个词');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/sensitive-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: wordList, category: formCategory }),
      });
      if (!res.ok) throw new Error('添加失败');
      const data = await res.json();
      toast.success(`成功添加 ${data.created} 个词（共 ${data.total} 个，重复自动忽略）`);
      setBulkInput('');
      setDrawerOpen(false);
      fetchWords();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Toggle enabled ──
  const handleToggle = async (word: SensitiveWord) => {
    try {
      const res = await fetch(`/api/admin/sensitive-words/${word.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !word.enabled }),
      });
      if (!res.ok) throw new Error('操作失败');
      toast.success(word.enabled ? '已禁用' : '已启用');
      // Optimistically update locally for faster transition, or just fetch
      setWords(prev => prev.map(w => w.id === word.id ? { ...w, enabled: !w.enabled } : w));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  // ── Delete ──
  const handleDeleteClick = (id: string, wordText: string) => {
    setDeletingId(id);
    setDeletingName(wordText);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      const res = await fetch(`/api/admin/sensitive-words/${deletingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast.success('已删除');
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      setDeletingName('');
      fetchWords();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  // ── Edit save ──
  const handleEditSave = async () => {
    if (!editingId || !editWord.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/sensitive-words/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: editWord.trim(), category: editCategory }),
      });
      if (!res.ok) throw new Error('保存失败');
      toast.success('已保存');
      setEditingId(null);
      fetchWords();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (w: SensitiveWord) => {
    setEditingId(w.id);
    setEditWord(w.word);
    setEditCategory(w.category);
  };

  // ── Filtered list ──
  const filtered = words.filter((w) => {
    if (search && !w.word.toLowerCase().includes(search.toLowerCase()) && !w.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categories = getCategories(words);
  const enabledCount = words.filter((w) => w.enabled).length;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 dark:from-red-500/5 dark:to-rose-500/5 border border-red-500/20 dark:border-red-500/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 dark:bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)] shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">敏感词管理</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              配置一对一对练中的违禁词汇。若命中敏感词，AI 陪练对话将自动终止。
            </p>
          </div>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm shrink-0 min-w-[90px]">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">已启用</div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{enabledCount}</div>
          </div>
          <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm shrink-0 min-w-[90px]">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">总词汇数</div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300 tabular-nums">{words.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
        {/* Left Column: Filter Panel (1/4 width) */}
        <div className="col-span-1 space-y-6">
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-400 to-rose-500" />
            <h3 className="font-semibold text-lg mb-5 text-slate-800 dark:text-slate-200">搜索与过滤</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">关键词搜索</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="输入词汇或分类..."
                    className="pl-9 focus-visible:ring-red-500 focus-visible:border-red-500 dark:bg-slate-950 transition-all rounded-xl w-full"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">状态筛选</Label>
                <select
                  value={filterEnabled}
                  onChange={(e) => setFilterEnabled(e.target.value as 'all' | 'true' | 'false')}
                  className="w-full h-10 px-3 py-2 border border-slate-200 bg-transparent rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 transition-all"
                >
                  <option value="all" className="dark:bg-slate-950">全部状态</option>
                  <option value="true" className="dark:bg-slate-950">已启用</option>
                  <option value="false" className="dark:bg-slate-950">已禁用</option>
                </select>
              </div>
            </div>
          </div>

          {/* Stats by category */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">分类筛选</h3>
            <div className="space-y-2">
              <button
                onClick={() => setFilterCategory('')}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  filterCategory === '' 
                    ? 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400' 
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                <span>全部敏感词</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold tabular-nums ${
                  filterCategory === '' 
                    ? 'bg-red-500/20 text-red-700 dark:text-red-300' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {words.length}
                </span>
              </button>
              {categories.map((cat) => {
                const isSelected = cat === filterCategory;
                const catWordsCount = words.filter((w) => w.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat === filterCategory ? '' : cat)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                      isSelected 
                        ? 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent text-slate-600 dark:text-slate-400'
                }`}
                  >
                    <span>{cat || '(无分类)'}</span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold tabular-nums ${
                      isSelected 
                        ? 'bg-red-500/20 text-red-700 dark:text-red-300' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {catWordsCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Word list (3/4 width) */}
        <div className="col-span-1 md:col-span-3 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          {/* Header toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-200">词汇列表</h2>
              {!loading && (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">
                  (已选分类: {filterCategory || '全部'}，过滤后共 {filtered.length} 个)
                </span>
              )}
            </div>
            <Button 
              onClick={() => setDrawerOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl h-10 px-4 shadow-sm flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>新增敏感词</span>
            </Button>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-4 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                <span>加载数据中...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2 border-2 border-dashed border-slate-100 dark:border-slate-800/80 rounded-2xl">
                <ShieldAlert className="w-8 h-8 opacity-20" />
                <span>暂无敏感词数据</span>
              </div>
            ) : (
              filtered.map((w) => {
                const isEditing = editingId === w.id;
                
                if (isEditing) {
                  return (
                    <div 
                      key={w.id} 
                      className="p-4 bg-red-500/5 dark:bg-red-500/5 border border-red-500/30 dark:border-red-500/20 rounded-2xl shadow-[0_4px_16px_rgba(239,68,68,0.06)] flex flex-col sm:flex-row sm:items-center gap-4 transition-all duration-300 animate-in fade-in zoom-in-95 duration-200"
                    >
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-word-${w.id}`} className="text-xs font-semibold text-red-500 dark:text-red-400">词汇内容</Label>
                          <Input
                            id={`edit-word-${w.id}`}
                            value={editWord}
                            onChange={(e) => setEditWord(e.target.value)}
                            placeholder="违禁词"
                            className="focus-visible:ring-red-500 focus-visible:border-red-500 dark:bg-slate-950 rounded-xl"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-cat-${w.id}`} className="text-xs font-semibold text-slate-500 dark:text-slate-400">词汇分类</Label>
                          <Input
                            id={`edit-cat-${w.id}`}
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            placeholder="竞品词、不合规用语"
                            list="category-list"
                            className="focus-visible:ring-red-500 focus-visible:border-red-500 dark:bg-slate-950 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4 sm:mt-5 shrink-0 justify-end">
                        <Button 
                          onClick={handleEditSave} 
                          disabled={submitting} 
                          className="bg-red-600 hover:bg-red-700 text-white shrink-0 rounded-xl"
                        >
                          保存
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setEditingId(null)} 
                          className="border-slate-200 dark:border-slate-800 shrink-0 rounded-xl"
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={w.id} 
                    className="flex items-center justify-between gap-4 px-5 py-4 border border-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/40 hover:border-slate-100 dark:hover:border-slate-800/60 rounded-2xl hover:shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Toggle Switch */}
                      <div className="shrink-0 flex items-center">
                        <Switch 
                          checked={w.enabled} 
                          onCheckedChange={() => handleToggle(w)} 
                          className="data-[state=checked]:bg-red-600"
                          title={w.enabled ? '点击禁用' : '点击启用'}
                        />
                      </div>
                      
                      {/* Word */}
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-semibold transition-all block truncate ${
                          w.enabled 
                            ? 'text-slate-800 dark:text-slate-200' 
                            : 'text-slate-400 line-through decoration-slate-300 dark:decoration-slate-700/80'
                        }`}>
                          {w.word}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Category */}
                      {w.category && (
                        <span className="text-[10px] px-2.5 py-0.5 font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {w.category}
                        </span>
                      )}

                      {/* Created at */}
                      <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(w.createdAt).toLocaleDateString()}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button 
                          type="button"
                          onClick={() => startEdit(w)} 
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleDeleteClick(w.id, w.word)} 
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bulk Add Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setDrawerOpen(false)} 
          />
          
          {/* Drawer Body */}
          <div className="relative w-full max-w-md bg-white/95 dark:bg-slate-900/95 border-l border-slate-200 dark:border-slate-800 h-full p-6 shadow-2xl overflow-y-auto flex flex-col z-10 animate-in slide-in-from-right duration-300 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-6">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">添加敏感词</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">支持批量添加，词汇用换行或逗号分隔</p>
              </div>
              <button 
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkAdd} className="space-y-6 flex-1 flex flex-col">
              <div className="space-y-2 flex-1 flex flex-col">
                <Label htmlFor="bulk-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  词汇内容 (换行/逗号/分号分隔)
                </Label>
                <Textarea
                  id="bulk-input"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={'请输入词汇...\n例如：\n违规用语1\n违规用语2, 违规用语3'}
                  className="flex-1 min-h-[200px] focus-visible:ring-red-500 focus-visible:border-red-500 dark:bg-slate-950 resize-none transition-all rounded-xl"
                  required
                />
              </div>
              <div className="space-y-2 shrink-0">
                <Label htmlFor="form-category-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  词汇分类 (可选)
                </Label>
                <Input
                  id="form-category-input"
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="例如：竞品词、脏话"
                  list="category-list"
                  className="focus-visible:ring-red-500 focus-visible:border-red-500 dark:bg-slate-950 transition-all rounded-xl"
                />
                <datalist id="category-list">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              
              <div className="flex gap-3 pt-6 border-t border-slate-100 dark:border-slate-800 mt-auto shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDrawerOpen(false)}
                  className="flex-1 border-slate-200 dark:border-slate-800 rounded-xl"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white transition-colors rounded-xl font-semibold shadow-sm"
                >
                  {submitting ? '正在添加...' : '确定添加'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setDeleteConfirmOpen(false)} />
          
          {/* Modal Body */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 to-red-500" />
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400 mx-auto mb-4 shadow-sm border border-red-500/20">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">确定删除敏感词？</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                确定要删除敏感词 <span className="font-bold text-red-600 dark:text-red-400">“{deletingName}”</span> 吗？此操作将永久移除该数据，无法撤销。
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-3">
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
