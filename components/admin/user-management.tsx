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
import { Trash2, UserPlus, Shield, User } from 'lucide-react';

interface UserRecord {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  providerType: string;
  createdAt: string;
}

interface UserManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManagementDialog({ open, onOpenChange }: UserManagementDialogProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/db/user');
      const result = await res.json();
      if (result.success) {
        setUsers(result.data);
      } else {
        toast.error('获取用户列表失败');
      }
    } catch (err) {
      toast.error('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setUsername('');
        setPassword('');
        setName('');
        setRole('user');
        fetchUsers();
      } else {
        toast.error(result.error || '创建失败');
      }
    } catch (err) {
      toast.error('网络请求失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: UserRecord) => {
    if (user.role === 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
      toast.error('不能删除最后一个管理员');
      return;
    }
    
    if (!confirm(`确定要删除用户 "${user.name}" 吗？该操作不可逆转！`)) {
      return;
    }

    try {
      const res = await fetch('/api/db/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          data: { id: user.id },
        }),
      });
      const result = await res.json();

      if (result.success) {
        toast.success('用户已删除');
        fetchUsers();
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (err) {
      toast.error('网络请求失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <div className="p-6 border-b border-border">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              用户管理
            </DialogTitle>
            <DialogDescription>
              仅管理员可见。您可以添加新账号或删除已有账号。
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
          {/* 左侧：创建用户表单 */}
          <div className="w-full md:w-1/3 space-y-4">
            <div className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              添加新用户
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4 bg-muted/30 p-4 rounded-lg border border-border">
              <div className="space-y-2">
                <label className="text-xs font-medium">登录账号</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="如: admin123"
                  className="bg-background"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">登录密码</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少6位"
                  className="bg-background"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">显示姓名</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如: 张老师"
                  className="bg-background"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">角色权限</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">普通用户 (User)</SelectItem>
                    <SelectItem value="admin">管理员 (Admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? '正在创建...' : '创建账号'}
              </Button>
            </form>
          </div>

          {/* 右侧：用户列表 */}
          <div className="w-full md:w-2/3 space-y-4">
            <div className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <User className="w-4 h-4" />
              已有用户列表
            </div>
            <div className="bg-muted/10 rounded-lg border border-border divide-y divide-border h-[400px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">加载中...</div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                users.map((u) => (
                  <div key={u.id} className="p-3 pl-4 pr-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{u.name}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {u.username}
                        </span>
                        {u.role === 'admin' ? (
                          <span className="text-[10px] font-bold text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-200 dark:border-yellow-800">
                            ADMIN
                          </span>
                        ) : (
                          <span className="text-[10px] text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                            USER
                          </span>
                        )}
                        {u.providerType !== 'credentials' && (
                          <span className="text-[10px] text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800 uppercase">
                            {u.providerType}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        注册时间: {new Date(u.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {/* Don't allow OAuth users to be deleted from here to prevent sync issues if desired, but for now allow it. */}
                    <Button 
                      variant="ghost" 
                      size="icon-sm" 
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                      onClick={() => handleDeleteUser(u)}
                      title="删除用户"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
