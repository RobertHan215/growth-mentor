'use client';

import { useState, useEffect } from 'react';
import { 
  FolderTree, 
  Folder, 
  FolderOpen, 
  Plus, 
  Trash2, 
  Pencil, 
  ChevronDown, 
  ChevronRight, 
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  children: Category[];
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Deletion modal states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState('');

  // Collapse state for top-level categories
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('获取分类失败');
      const data = await res.json();
      setCategories(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const resolvedParentId = parentId === 'none' || !parentId ? null : parentId;

    try {
      const url = editingId ? `/api/categories/${editingId}` : '/api/categories';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: resolvedParentId })
      });

      if (!res.ok) throw new Error('保存分类失败');
      
      toast.success(editingId ? '分类已更新' : '分类已创建');
      setName('');
      setParentId('none');
      setEditingId(null);
      fetchCategories();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteClick = (id: string, catName: string) => {
    setDeletingId(id);
    setDeletingName(catName);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      const res = await fetch(`/api/categories/${deletingId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || '删除失败');
      }
      toast.success('已删除');
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      setDeletingName('');
      fetchCategories();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setParentId(cat.parentId || 'none');
    // Scroll and focus
    const inputEl = document.getElementById('category-name-input');
    if (inputEl) {
      inputEl.focus();
    }
  };

  const handleAddSubcategory = (parentCat: Category) => {
    setEditingId(null);
    setName('');
    setParentId(parentCat.id);
    
    // Auto expand the parent category if collapsed
    if (collapsedIds[parentCat.id]) {
      setCollapsedIds(prev => ({ ...prev, [parentCat.id]: false }));
    }
    
    const inputEl = document.getElementById('category-name-input');
    if (inputEl) {
      inputEl.focus();
    }
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const rootCategories = categories.filter(c => !c.parentId);

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/5 dark:to-orange-500/5 border border-amber-500/20 dark:border-amber-500/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)] shrink-0">
            <FolderTree className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">分类管理</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              维护课程的层级分类结构，用于知识树导航与内容组织。
            </p>
          </div>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm shrink-0 min-w-[90px]">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">总分类数</div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">{categories.length}</div>
          </div>
          <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm shrink-0 min-w-[90px]">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">一级分类</div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300 tabular-nums">{rootCategories.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Form Panel */}
        <div className={`col-span-1 border rounded-2xl p-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm relative overflow-hidden transition-all duration-300 ${
          editingId 
            ? 'border-amber-500 ring-2 ring-amber-500/20 dark:ring-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.12)] shadow-amber-500/5' 
            : 'border-slate-200/80 dark:border-slate-800 shadow-sm'
        }`}>
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 to-amber-600" />
          
          <h2 className="font-semibold text-lg mb-5 text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span>{editingId ? '编辑分类' : '新增分类'}</span>
            {editingId && (
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md animate-pulse">
                编辑模式
              </span>
            )}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="category-name-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                分类名称
              </Label>
              <Input
                id="category-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：前端开发"
                className="focus-visible:ring-amber-500 focus-visible:border-amber-500 dark:bg-slate-950 transition-all rounded-xl"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                父级分类 (可选)
              </Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="focus:ring-amber-500 dark:bg-slate-950 transition-all rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <SelectValue placeholder="无 (作为一级分类)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无 (作为一级分类)</SelectItem>
                  {categories.filter(c => !c.parentId && c.id !== editingId).map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white transition-colors rounded-xl font-semibold text-sm h-10"
              >
                {editingId ? '保存更改' : '添加分类'}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setName('');
                    setParentId('none');
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
          <h2 className="font-semibold text-lg mb-5 text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span>层级列表</span>
            {!loading && <span className="text-xs font-normal text-slate-400 dark:text-slate-500">共 {rootCategories.length} 个一级分类</span>}
          </h2>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span>加载数据中...</span>
            </div>
          ) : rootCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2 border-2 border-dashed border-slate-100 dark:border-slate-800/80 rounded-xl">
              <FolderTree className="w-8 h-8 opacity-20" />
              <span>暂无分类数据，请在左侧添加</span>
            </div>
          ) : (
            <ul className="space-y-4">
              {rootCategories.map((cat) => {
                const isCollapsed = collapsedIds[cat.id] ?? false;
                const hasChildren = cat.children && cat.children.length > 0;
                
                return (
                  <li key={cat.id} className="space-y-3">
                    {/* First Level Item */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60 hover:shadow-sm hover:border-amber-500/30 dark:hover:border-amber-500/20 hover:-translate-y-0.5 transition-all duration-300 group/item">
                      <div className="flex items-center gap-3">
                        {/* Toggle Collapse */}
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleCollapse(cat.id)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700/60 rounded transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <div className="w-6 shrink-0" />
                        )}
                        
                        <Folder className="w-4 h-4 text-amber-500 fill-amber-500/10 shrink-0" />
                        <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                          {cat.name}
                        </span>
                        {hasChildren && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium border border-amber-500/10">
                            {cat.children.length}
                          </span>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-80 md:opacity-0 md:group-hover/item:opacity-100 transition-opacity duration-300">
                        <button
                          type="button"
                          onClick={() => handleAddSubcategory(cat)}
                          title="在此分类下添加子分类"
                          className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-500/10 rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(cat)}
                          title="编辑分类"
                          className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(cat.id, cat.name)}
                          title="删除分类"
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
 
                    {/* Second Level Items */}
                    {!isCollapsed && hasChildren && (
                      <ul className="pl-9 space-y-2 relative">
                        {/* Vertical line connecting children */}
                        <div className="absolute left-[13px] top-0 bottom-[22px] w-0.5 border-l-2 border-dashed border-slate-200 dark:border-slate-800" />
                        
                        {cat.children.map((child) => (
                          <li key={child.id} className="relative pl-6 group/child">
                            {/* Branch elbow line */}
                            <div className="absolute left-[-23px] top-0 h-[22px] w-6 border-l-2 border-b-2 border-dashed border-slate-200 dark:border-slate-800 rounded-bl-lg" />
                            
                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/40 hover:border-amber-500/20 dark:hover:border-amber-500/10 hover:shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all duration-300">
                              <div className="flex items-center gap-2.5">
                                <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-sm text-slate-600 dark:text-slate-300">
                                  {child.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-80 md:opacity-0 md:group-hover/child:opacity-100 transition-opacity duration-300">
                                <button
                                  type="button"
                                  onClick={() => startEdit(child)}
                                  title="编辑分类"
                                  className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteClick(child.id, child.name)}
                                  title="删除分类"
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
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
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 to-amber-500" />
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto mb-4 shadow-sm border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">确定删除分类？</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                确定要删除分类 <span className="font-bold text-amber-600 dark:text-amber-400">“{deletingName}”</span> 吗？此操作将永久移除该数据，无法撤销。
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
