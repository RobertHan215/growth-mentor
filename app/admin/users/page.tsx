'use client';

import { useState, useEffect } from 'react';
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
import { UserPlus, Shield, User, Pencil, Loader2, Calendar, ShieldCheck, X, Search, Ban } from 'lucide-react';

interface UserRecord {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  providerType: string;
  createdAt: string;
  enabled?: boolean;
}

const GRADIENTS = [
  'from-pink-500 to-rose-500',
  'from-purple-500 to-indigo-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-red-500 to-orange-500',
];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Form states in Drawer
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  // Unified fetch with search and pagination params
  const fetchUsers = async (currentPage = page, currentSearch = search) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/db/user?page=${currentPage}&limit=${limit}&search=${encodeURIComponent(currentSearch)}`);
      const result = await res.json();
      if (result.success) {
        setUsers(result.data);
        setTotal(result.total ?? result.data.length);
      } else {
        toast.error('获取用户列表失败');
      }
    } catch {
      toast.error('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  // Trigger search and pagination fetch with 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(page, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search]);

  // When search keyword changes, automatically jump back to page 1
  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (drawerMode === 'edit' && editingUser) {
      // Edit mode
      if (!name) {
        toast.error('请填写完整信息');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch('/api/db/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            data: {
              id: editingUser.id,
              name,
              role,
              password: password || undefined,
            },
          }),
        });
        const result = await res.json();

        if (result.success) {
          toast.success('用户信息已更新');
          setIsDrawerOpen(false);
          setEditingUser(null);
          setUsername('');
          setPassword('');
          setName('');
          setRole('user');
          fetchUsers(page, search);
        } else {
          toast.error(result.error || '保存失败');
        }
      } catch {
        toast.error('网络请求失败');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Create mode
      if (!username || !password || !name) {
        toast.error('请填写完整信息');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch('/api/db/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            data: { username, password, name, role },
          }),
        });
        const result = await res.json();

        if (result.success) {
          toast.success('用户创建成功');
          setIsDrawerOpen(false);
          setUsername('');
          setPassword('');
          setName('');
          setRole('user');
          setPage(1);
          fetchUsers(1, search);
        } else {
          toast.error(result.error || '创建失败');
        }
      } catch {
        toast.error('网络请求失败');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleToggleEnable = async (user: UserRecord) => {
    const isTargetAdmin = user.role === 'admin' || user.username === 'admin';
    if (isTargetAdmin) {
      toast.error('管理员账号无法禁用');
      return;
    }

    const newStatus = user.enabled === false ? true : false;
    const actionText = newStatus ? '启用' : '禁用';

    if (!confirm(`确定要${actionText}用户 "${user.name}" 吗？`)) {
      return;
    }

    try {
      const res = await fetch('/api/db/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          data: {
            id: user.id,
            enabled: newStatus,
          },
        }),
      });
      const result = await res.json();

      if (result.success) {
        toast.success(`用户已${actionText}`);
        fetchUsers(page, search);
      } else {
        toast.error(result.error || `${actionText}失败`);
      }
    } catch {
      toast.error('网络请求失败');
    }
  };

  const handleStartCreate = () => {
    setEditingUser(null);
    setDrawerMode('create');
    setUsername('');
    setPassword('');
    setName('');
    setRole('user');
    setIsDrawerOpen(true);
  };

  const handleStartEdit = (user: UserRecord) => {
    setEditingUser(user);
    setDrawerMode('edit');
    setUsername(user.username);
    setName(user.name);
    setRole(user.role);
    setPassword(''); // Leave empty for editing
    setIsDrawerOpen(true);
  };

  const getAvatarGradient = (uname: string | null | undefined) => {
    const nameStr = uname || 'default';
    let hash = 0;
    for (let i = 0; i < nameStr.length; i++) {
      hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % GRADIENTS.length;
    return GRADIENTS[index];
  };

  const getAvatarText = (n: string | null | undefined) => {
    if (!n) return 'U';
    return n.charAt(0).toUpperCase();
  };

  const adminCount = users.filter(u => u.role === 'admin').length;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-500/10 to-pink-500/10 dark:from-rose-500/5 dark:to-pink-500/5 border border-rose-500/20 dark:border-rose-500/10 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)] shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">用户管理</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              管理系统用户账户，配置并分配角色权限以确保数据安全与合规。
            </p>
          </div>
        </div>
        
        {/* Stats only */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm shrink-0 min-w-[80px]">
              <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">总用户数</div>
              <div className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums">{total}</div>
            </div>
            <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-sm shrink-0 min-w-[80px]">
              <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">管理员</div>
              <div className="text-base font-bold text-slate-700 dark:text-slate-300 tabular-nums">{adminCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main通栏 List Panel */}
      <div className="w-full space-y-4">
        <div className="font-semibold text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 px-1">
          <Shield className="w-4 h-4 text-rose-500" />
          系统账号列表
          {!loading && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">({total})</span>}
        </div>
        
        <div className="bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          {/* Search toolbar & Add Action */}
          <div className="px-5 py-4 border-b border-slate-200/50 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索用户姓名或登录账号..."
                className="pl-9 focus-visible:ring-rose-500 focus-visible:border-rose-500 dark:bg-slate-950 transition-all w-full"
              />
            </div>
            
            <Button 
              onClick={handleStartCreate}
              className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 rounded-xl shadow-sm hover:shadow-md transition-all shrink-0 h-10 px-4 font-semibold text-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>新增账户</span>
            </Button>
          </div>

          {/* List items - Refactored as Cards with custom hover shadows */}
          <div className="flex-1 p-5 space-y-3.5">
            {loading ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400 text-sm gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
                <span>正在加载数据...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400 text-sm gap-2 border-2 border-dashed border-slate-200/60 dark:border-slate-800/60 rounded-2xl bg-white/20 dark:bg-slate-900/10">
                <User className="w-8 h-8 opacity-20" />
                <span>暂无符合过滤条件的账户</span>
              </div>
            ) : (
              users.map((u) => (
                <div 
                  key={u.id} 
                  className={`p-4 sm:p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${
                    u.enabled === false
                      ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/40 dark:border-slate-800/40 opacity-60' 
                      : 'bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800/80 hover:border-rose-200 dark:hover:border-rose-900/30 hover:shadow-[0_4px_20px_rgba(244,63,94,0.06)] hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Unique Gradient Avatar */}
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getAvatarGradient(u.username)} flex items-center justify-center text-white font-extrabold text-lg shrink-0 shadow-sm border border-white/20 dark:border-slate-800/50`}>
                      {getAvatarText(u.name)}
                    </div>
                    
                    <div className="flex flex-col min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-base text-slate-800 dark:text-slate-200 truncate">{u.name}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200/40 dark:border-slate-800/50 px-2 py-0.5 rounded-md">
                          {u.username}
                        </span>
                        
                        {/* Glassmorphic Roles Badges */}
                        {u.role === 'admin' ? (
                          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            管理员
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                            普通用户
                          </span>
                        )}

                        {u.enabled === false && (
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1 animate-pulse">
                            <Ban className="w-3 h-3 shrink-0" />
                            已禁用
                          </span>
                        )}
                        
                        {u.providerType !== 'credentials' && (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full backdrop-blur-sm uppercase">
                            {u.providerType}
                          </span>
                        )}
                      </div>
                      
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        注册于 {new Date(u.createdAt).toLocaleDateString()} {new Date(u.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 shrink-0 border-t border-slate-100 dark:border-slate-800/50 pt-3 md:pt-0 md:border-0 pl-0 md:pl-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(u)}
                      className="border-slate-200/80 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-900/50 flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-semibold transition-all duration-300"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>编辑</span>
                    </Button>
                    
                    {u.role === 'admin' || u.username === 'admin' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        title="管理员账号无法禁用"
                        className="border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-semibold opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>禁用</span>
                      </Button>
                    ) : u.enabled === false ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleEnable(u)}
                        className="border-slate-200/80 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-900/50 flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-semibold transition-all duration-300"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>启用</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleEnable(u)}
                        className="border-slate-200/80 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:text-red-400 hover:border-red-200 dark:hover:border-red-900/50 flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-semibold transition-all duration-300"
                      >
                        <Ban className="w-3.5 h-3.5 text-red-500" />
                        <span>禁用</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Pagination Controls */}
            {total > limit && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  显示第 {(page - 1) * limit + 1} 到 {Math.min(page * limit, total)} 条，共 {total} 条数据
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="border-slate-200/80 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl h-9 px-3 text-xs font-semibold transition-all"
                  >
                    上一页
                  </Button>
                  
                  {/* 页码按钮 */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    if (
                      totalPages > 6 &&
                      p !== 1 &&
                      p !== totalPages &&
                      Math.abs(p - page) > 1
                    ) {
                      if (p === 2 && page > 3) {
                        return <span key={p} className="text-slate-400 dark:text-slate-600 px-1.5 text-xs font-semibold select-none">...</span>;
                      }
                      if (p === totalPages - 1 && page < totalPages - 2) {
                        return <span key={p} className="text-slate-400 dark:text-slate-600 px-1.5 text-xs font-semibold select-none">...</span>;
                      }
                      return null;
                    }
                    return (
                      <Button
                        key={p}
                        variant={page === p ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPage(p)}
                        className={`h-9 w-9 rounded-xl text-xs font-bold transition-all ${
                          page === p
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow'
                            : 'border-slate-200/80 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-400'
                        }`}
                      >
                        {p}
                      </Button>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="border-slate-200/80 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl h-9 px-3 text-xs font-semibold transition-all"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide-out Drawer (Sheet) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
          {/* Backdrop overlay */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={() => setIsDrawerOpen(false)}
          />
          
          {/* Sliding Panel */}
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                {drawerMode === 'create' ? <UserPlus className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 truncate">
                  {drawerMode === 'create' ? '新增系统账户' : '编辑用户资料'}
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">
                  {drawerMode === 'create' ? '创建新的系统管理员或普通用户账号' : `修改用户 [${editingUser?.name}] 的显示名与角色`}
                </p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form body with structured layout */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Section 1: Basic Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="w-1.5 h-3 bg-rose-500 rounded-full" />
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">基本信息</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-name" className="text-sm font-semibold text-slate-700 dark:text-slate-300">显示姓名</Label>
                  <Input
                    id="drawer-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如: 张老师"
                    required
                    className="focus-visible:ring-rose-500 focus-visible:border-rose-500 dark:bg-slate-950 transition-all rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-username" className="text-sm font-semibold text-slate-700 dark:text-slate-300">登录账号</Label>
                  <Input
                    id="drawer-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="如: user_example"
                    required
                    disabled={drawerMode === 'edit'}
                    className="focus-visible:ring-rose-500 focus-visible:border-rose-500 dark:bg-slate-950 disabled:bg-slate-50 dark:disabled:bg-slate-950/50 transition-all rounded-xl"
                  />
                </div>
              </div>

              {/* Section 2: Security & Permissions */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="w-1.5 h-3 bg-rose-500 rounded-full" />
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">安全与权限</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {drawerMode === 'edit' ? '重置登录密码 (留空则不修改)' : '登录密码'}
                  </Label>
                  <Input
                    id="drawer-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={drawerMode === 'edit' ? '输入新密码以重置' : '至少 6 位密码'}
                    required={drawerMode === 'create'}
                    className="focus-visible:ring-rose-500 focus-visible:border-rose-500 dark:bg-slate-950 transition-all rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">角色权限</Label>
                  <Select 
                    value={role} 
                    onValueChange={setRole}
                    disabled={drawerMode === 'edit' && (editingUser?.role === 'admin' || editingUser?.username === 'admin')}
                  >
                    <SelectTrigger className="focus:ring-rose-500 dark:bg-slate-950 transition-all rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                      <SelectValue placeholder="选择角色" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">普通用户 (User)</SelectItem>
                      <SelectItem value="admin">管理员 (Admin)</SelectItem>
                    </SelectContent>
                  </Select>
                  {drawerMode === 'edit' && (editingUser?.role === 'admin' || editingUser?.username === 'admin') && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      提示：管理员账号的角色权限无法被修改。
                    </p>
                  )}
                </div>
              </div>
              
              {/* Hidden submit button to support Enter key submission */}
              <button type="submit" className="hidden" />
            </form>

            {/* Footer buttons */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/30 dark:bg-slate-900/30 shrink-0">
              <Button 
                variant="outline" 
                onClick={() => setIsDrawerOpen(false)}
                className="border-slate-200 dark:border-slate-800 rounded-xl"
              >
                取消
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting}
                className="bg-rose-600 hover:bg-rose-700 text-white transition-colors min-w-[90px] rounded-xl flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmitting ? '保存中...' : '确定'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
