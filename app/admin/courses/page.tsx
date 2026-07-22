'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Loader2,
  Check,
  Pencil,
  X,
  Globe,
  Users,
  Shield,
  ChevronDown,
  Image,
  Grid,
  List,
  Search,
  Trash2,
  AlertTriangle,
  Plus,
  ArrowRight,
  ExternalLink,
  Folder,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { getFirstSlideByStages } from '@/lib/utils/stage-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';
import { deriveLearningMode } from '@/lib/training/course-learning-mode';
import { ScoringConfigPreviewDialog } from '@/components/admin/scoring-config-preview-dialog';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

interface Course {
  id: string;
  name: string;
  isPublished: boolean;
  categoryId: string | null;
  learningMode?: 'teaching' | 'oneOnOne';
  directorConfig: ({ supportedModes?: string[] } & Record<string, unknown>) | null;
  user: { name: string; email: string };
  stageTags: { tag: Tag }[];
  updatedAt: string;
  visibilityRoles: string | null;
  visibilityUsers: string | null;
  coverImage?: string | null;
  oneOnOneTagId?: string | null;
}

interface SimpleUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
}

const AVAILABLE_ROLES = ['admin', 'manager', 'teacher', 'user'];

type VisibilityMode = 'all' | 'roles' | 'hidden';

interface FormattedCategory {
  id: string;
  name: string;
  depth: number;
}

interface CategorySelectorProps {
  categories: Category[];
  value: string;
  onChange: (val: string) => void;
}

function CategorySelector({ categories, value, onChange }: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 重置搜索词当展开/关闭时
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // 构建排序后的树状列表
  const formattedCategories = useMemo<FormattedCategory[]>(() => {
    const result: FormattedCategory[] = [];
    const buildTree = (parentId: string | null, depth: number) => {
      const children = categories.filter((c) => c.parentId === parentId);
      children.forEach((c) => {
        result.push({ id: c.id, name: c.name, depth });
        buildTree(c.id, depth + 1);
      });
    };
    buildTree(null, 0);

    // 容错：将未在树中的分类补在末尾
    const addedIds = new Set(result.map((r) => r.id));
    categories.forEach((c) => {
      if (!addedIds.has(c.id)) {
        result.push({ id: c.id, name: c.name, depth: 0 });
      }
    });

    return result;
  }, [categories]);

  // 按搜索词过滤
  const filteredCategories = useMemo<FormattedCategory[]>(() => {
    if (!searchQuery.trim()) return formattedCategories;
    const query = searchQuery.toLowerCase();
    return formattedCategories.filter((c) => c.name.toLowerCase().includes(query));
  }, [formattedCategories, searchQuery]);

  const currentCategory = categories.find((c) => c.id === value);

  return (
    <div ref={containerRef} className="relative w-full z-20">
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full h-10 px-3.5 flex items-center justify-between rounded-xl border text-sm font-medium transition-all focus:outline-none",
          isOpen
            ? "border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-900 shadow-sm"
            : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30",
          currentCategory ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"
        )}
      >
        <div className="flex items-center gap-2 truncate">
          <Folder className={cn("w-4 h-4 shrink-0", currentCategory ? "text-blue-500" : "text-slate-400 dark:text-slate-500")} />
          <span className="truncate">{currentCategory ? currentCategory.name : "未分类"}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {/* 下拉面板 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl overflow-hidden z-30"
          >
            {/* 搜索框 */}
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/20">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索分类..."
                className="w-full bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 p-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1"
                >
                  ×
                </button>
              )}
            </div>

            {/* 选项列表 */}
            <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
              {/* 未分类选项 */}
              {!searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs rounded-lg transition-colors flex items-center gap-2",
                    !value
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                  未分类
                </button>
              )}

              {/* 树状分类项 */}
              {filteredCategories.length > 0 ? (
                filteredCategories.map((c) => {
                  const isSelected = value === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full py-2 text-left text-xs rounded-lg transition-all flex items-center gap-1.5 relative group",
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      )}
                      style={{ paddingLeft: `${12 + c.depth * 16}px` }}
                    >
                      {/* 如果有深度，渲染排版辅助小横杠 */}
                      {c.depth > 0 && (
                        <span className="text-slate-300 dark:text-slate-700 font-light select-none mr-0.5">
                          └─
                        </span>
                      )}
                      <Folder className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "text-blue-500" : "text-slate-400 group-hover:text-slate-500")} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  未找到相关分类
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '保存失败';
}

// ─── Inline name editor cell ───────────────────────────────────────────────
function NameCell({
  course,
  onSave,
}: {
  course: Course;
  onSave: (id: string, name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(course.name);
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(course.name);
  }, [course.name]);

  const startEdit = () => {
    setValue(course.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === course.name) {
      setValue(course.name);
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(course.id, trimmed);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              setValue(course.name);
              setEditing(false);
            }
          }}
          disabled={saving}
          className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 bg-transparent border-b border-indigo-400 dark:border-indigo-500 outline-none px-0.5 py-0.5 max-w-[180px]"
          autoFocus
        />
        {saving && <Loader2 className="size-3 animate-spin text-slate-400 shrink-0" />}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            setValue(course.name);
            setEditing(false);
          }}
          className="shrink-0 text-slate-400 hover:text-slate-600"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 cursor-default"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px]"
        title={course.name}
      >
        {course.name || 'Untitled'}
      </span>
      <button
        onClick={startEdit}
        title="重命名"
        className="shrink-0 transition-opacity p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
        style={{ opacity: hover ? 1 : 0, pointerEvents: hover ? 'auto' : 'none' }}
      >
        <Pencil className="size-3 text-indigo-500" />
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [scoringTagSavingId, setScoringTagSavingId] = useState<string | null>(null);

  // Layout mode: grid or list
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');

  // Multi-dimensional filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // States for previewing scoring configurations
  const [previewTagId, setPreviewTagId] = useState<string | null>(null);
  const [previewTagName, setPreviewTagName] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);

  // States for right slide-over edit drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  
  // Drawer drafts
  const [draftName, setDraftName] = useState('');
  const [draftCategory, setDraftCategory] = useState<string>('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftOneOnOneTagId, setDraftOneOnOneTagId] = useState<string | null>(null);
  const [draftCoverImage, setDraftCoverImage] = useState<string>('');
  const [draftVisMode, setDraftVisMode] = useState<VisibilityMode>('all');
  const [draftVisRoles, setDraftVisRoles] = useState<string[]>([]);
  const [draftVisUsers, setDraftVisUsers] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [activeAccordion, setActiveAccordion] = useState<'roles' | 'users' | null>('roles');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const filteredRoles = useMemo(() => {
    return AVAILABLE_ROLES.filter((role) =>
      role.toLowerCase().includes(roleSearchQuery.toLowerCase())
    );
  }, [roleSearchQuery]);

  const filteredUsers = useMemo(() => {
    let source = allUsers;
    if (showSelectedOnly) {
      source = allUsers.filter((u) => draftVisUsers.includes(u.id));
    }
    if (!userSearchQuery.trim()) return source;
    const query = userSearchQuery.toLowerCase();
    return source.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        u.role.toLowerCase().includes(query)
    );
  }, [userSearchQuery, allUsers, showSelectedOnly, draftVisUsers]);

  // States for deletion confirm dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [deleteInputName, setDeleteInputName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cr, cat, tr, ur] = await Promise.all([
        fetch('/api/admin/courses').then((res) => {
          if (!res.ok) throw new Error('Failed to fetch courses');
          return res.json();
        }),
        fetch('/api/categories').then((res) => {
          if (!res.ok) throw new Error('Failed to fetch categories');
          return res.json();
        }),
        fetch('/api/tags').then((res) => {
          if (!res.ok) throw new Error('Failed to fetch tags');
          return res.json();
        }),
        fetch('/api/db/user')
          .then((res) => (res.ok ? res.json() : { data: [] }))
          .catch(() => ({ data: [] })),
      ]);
      setCourses(Array.isArray(cr) ? cr : []);
      // Load slide thumbnails for courses without coverImage
      const idsWithoutCover = (cr as Course[]).filter((c) => !c.coverImage).map((c) => c.id);
      if (idsWithoutCover.length > 0) {
        getFirstSlideByStages(idsWithoutCover)
          .then(setThumbnails)
          .catch(() => {});
      }
      setCategories(Array.isArray(cat) ? cat : []);
      setTags(Array.isArray(tr) ? tr : []);
      setAllUsers(Array.isArray(ur?.data) ? ur.data : Array.isArray(ur) ? ur : []);
    } catch (e: any) {
      toast.error('获取数据失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('admin_courses_layout_mode');
    if (saved === 'grid' || saved === 'list') {
      setLayoutMode(saved);
    }
  }, []);

  const togglePublish = async (course: Course) => {
    try {
      const newPublished = !course.isPublished;
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPublished: newPublished,
          // When hiding, clear visibility restrictions
          ...(newPublished ? {} : { visibilityRoles: null, visibilityUsers: null }),
        }),
      });
      if (!res.ok) throw new Error('保存失败');

      setCourses((prev) =>
        prev.map((c) =>
          c.id === course.id
            ? {
                ...c,
                isPublished: newPublished,
                ...(newPublished ? {} : { visibilityRoles: null, visibilityUsers: null }),
              }
            : c,
        ),
      );
      toast.success(newPublished ? '已公开展示' : '已隐藏');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Save course name via admin API
  const saveName = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/admin/courses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('保存失败');
      // Optimistic update
      setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
      toast.success('课程名称已更新');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openEditDrawer = (course: Course) => {
    setSelectedCourse(course);
    setDraftName(course.name);
    setDraftCategory(course.categoryId || '');
    setDraftTags(course.stageTags.map((t) => t.tag.id));
    setDraftOneOnOneTagId(course.oneOnOneTagId || null);
    setDraftCoverImage(course.coverImage || '');
    setUserSearchQuery('');
    setRoleSearchQuery('');
    setActiveAccordion('roles');
    setShowSelectedOnly(false);

    const roles = parseJsonArr(course.visibilityRoles);
    const users = parseJsonArr(course.visibilityUsers);
    if (!course.isPublished) {
      setDraftVisMode('hidden');
    } else if (roles.length > 0 || users.length > 0) {
      setDraftVisMode('roles');
    } else {
      setDraftVisMode('all');
    }
    setDraftVisRoles(roles);
    setDraftVisUsers(users);
    setDrawerOpen(true);
  };

  const saveDrawerChanges = async () => {
    if (!selectedCourse) return;
    try {
      const payload: Record<string, any> = {
        name: draftName.trim(),
        categoryId: draftCategory || null,
        tagIds: draftTags,
        oneOnOneTagId: draftOneOnOneTagId || null,
        coverImage: draftCoverImage.trim() || null,
      };

      if (draftVisMode === 'hidden') {
        payload.isPublished = false;
        payload.visibilityRoles = null;
        payload.visibilityUsers = null;
      } else {
        payload.isPublished = true;
        if (draftVisMode === 'all') {
          payload.visibilityRoles = null;
          payload.visibilityUsers = null;
        } else {
          payload.visibilityRoles = draftVisRoles.length > 0 ? JSON.stringify(draftVisRoles) : null;
          payload.visibilityUsers = draftVisUsers.length > 0 ? JSON.stringify(draftVisUsers) : null;
        }
      }

      const res = await fetch(`/api/admin/courses/${selectedCourse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('保存失败');

      toast.success('课程配置已更新');
      setDrawerOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleDraftTag = (tagId: string) => {
    setDraftTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const openDeleteConfirm = (course: Course) => {
    setCourseToDelete(course);
    setDeleteInputName('');
    setDeleteConfirmOpen(true);
  };

  const handleDeleteCourse = async () => {
    if (!courseToDelete) return;
    if (deleteInputName.trim() !== courseToDelete.name) {
      toast.error('输入的课程名称不一致，无法删除');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');

      toast.success('课程已成功删除，关联数据已自动级联清理');
      setDeleteConfirmOpen(false);
      setCourseToDelete(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    const img = new window.Image();
    img.onload = () => {
      const MAX_DIM = 600;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(img.src);

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setDraftCoverImage(base64);
            toast.success('图片已处理并本地加载(降级)');
            return;
          }
          try {
            const formData = new FormData();
            formData.append('file', blob, 'cover.jpg');
            formData.append('type', 'poster');

            const uploadRes = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });

            if (!uploadRes.ok) {
              throw new Error('上传接口未配置或请求失败');
            }

            const resData = await uploadRes.json();
            if (resData.success && resData.url) {
              setDraftCoverImage(resData.url);
              toast.success('图片已成功上传并生成链接');
            } else {
              throw new Error(resData.error || '上传未返回URL');
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('上传接口不可用，已降级为本地 Base64 存储:', msg);
            setDraftCoverImage(base64);
            toast.success('图片已降级为本地 Base64 存储');
          }
        },
        'image/jpeg',
        0.7
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      toast.error('图片读取失败');
    };
    img.src = URL.createObjectURL(file);
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  // ── Visibility helpers ──
  function parseJsonArr(val: string | null): string[] {
    if (!val) return [];
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function getVisLabel(course: Course): { icon: React.ReactNode; label: string; color: string } {
    if (!course.isPublished)
      return {
        icon: <EyeOff className="w-3.5 h-3.5" />,
        label: '已隐藏',
        color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      };
    const roles = parseJsonArr(course.visibilityRoles);
    const users = parseJsonArr(course.visibilityUsers);
    if (roles.length === 0 && users.length === 0)
      return {
        icon: <Globe className="w-3.5 h-3.5" />,
        label: '完全公开',
        color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-100/30 dark:border-emerald-900/30',
      };
    return {
      icon: <Users className="w-3.5 h-3.5" />,
      label: '特定可见',
      color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 border-blue-100/30 dark:border-blue-900/30',
    };
  }

  // Filter logic
  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (course.user?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategoryId ? course.categoryId === selectedCategoryId : true;
    const learningMode = deriveLearningMode(course);
    const matchesMode = selectedMode ? learningMode === selectedMode : true;
    const matchesStatus = selectedStatus
      ? selectedStatus === 'published'
        ? course.isPublished
        : !course.isPublished
      : true;
    return matchesSearch && matchesCategory && matchesMode && matchesStatus;
  });

  const totalCount = courses.length;
  const publishedCount = courses.filter((c) => c.isPublished).length;
  const oneOnOneCount = courses.filter((c) => deriveLearningMode(c) === 'oneOnOne').length;
  const teachingCount = courses.filter((c) => deriveLearningMode(c) === 'teaching').length;

  const getPlaceholderStyle = (name: string) => {
    const charCode = name.charCodeAt(0) || 0;
    const gradients = [
      'from-indigo-500 to-purple-500',
      'from-emerald-500 to-teal-500',
      'from-amber-500 to-orange-500',
      'from-rose-500 to-pink-500',
      'from-blue-500 to-indigo-600',
      'from-purple-500 to-pink-500',
    ];
    return gradients[charCode % gradients.length];
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">课程管理</h1>
          <p className="text-xs text-slate-400 mt-1">管理系统课程发布状态、分类、评分规则与使用权限</p>
        </div>
      </div>

      {/* 统计看板 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: '课程总数', value: totalCount, color: 'from-blue-500 to-indigo-600', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20' },
          { label: '已发布课程', value: publishedCount, color: 'from-emerald-500 to-teal-600', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
          { label: '一对一对练', value: oneOnOneCount, color: 'from-amber-500 to-orange-600', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20' },
          { label: '教学模式课程', value: teachingCount, color: 'from-purple-500 to-pink-600', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/20' }
        ].map((card, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b ${card.color}`} />
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 tracking-wider uppercase">{card.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${card.bg} ${card.text}`}>实时指标</span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{card.value}</span>
              <span className="text-xs text-slate-400 font-medium">门</span>
            </div>
          </div>
        ))}
      </div>

      {/* 搜索与过滤栏 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 flex flex-wrap items-center gap-3">
          {/* 搜索框 */}
          <div className="relative min-w-[240px] flex-1 md:flex-initial">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索课程名称/创建者/ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 h-10 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500"
            />
          </div>
          {/* 分类筛选 */}
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="h-10 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">所有分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {/* 模式筛选 */}
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            className="h-10 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">所有模式</option>
            <option value="teaching">📖 教学模式</option>
            <option value="oneOnOne">⚔️ 一对一模式</option>
          </select>
          {/* 发布状态筛选 */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-10 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">所有状态</option>
            <option value="published">🌐 已公开</option>
            <option value="hidden">👁‍🗨 已隐藏</option>
          </select>
        </div>

        {/* 布局与操作 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center border border-slate-200 dark:border-slate-850 rounded-xl p-0.5 bg-slate-50 dark:bg-slate-950">
            <button
              onClick={() => {
                setLayoutMode('grid');
                localStorage.setItem('admin_courses_layout_mode', 'grid');
              }}
              className={`p-1.5 rounded-lg transition-all ${layoutMode === 'grid' ? 'bg-white dark:bg-slate-850 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="卡片网格"
            >
              <Grid className="size-4" />
            </button>
            <button
              onClick={() => {
                setLayoutMode('list');
                localStorage.setItem('admin_courses_layout_mode', 'list');
              }}
              className={`p-1.5 rounded-lg transition-all ${layoutMode === 'list' ? 'bg-white dark:bg-slate-850 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="精致列表"
            >
              <List className="size-4" />
            </button>
          </div>
          <Link
            href="/admin/generate"
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/10 hover:scale-[1.01]"
          >
            <Plus className="size-4" />
            AI 课程生成
          </Link>
        </div>
      </div>

      {/* 课程内容展示 */}
      {loading ? (
        <div className="py-20 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          <p className="mt-2 text-sm text-slate-400">正在加载课程列表...</p>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="py-20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center text-slate-400 bg-white dark:bg-slate-900">
          暂无匹配的课程数据
        </div>
      ) : layoutMode === 'grid' ? (
        /* 卡片网格视图 */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredCourses.map((course) => {
            const learningMode = deriveLearningMode(course);
            const isOneOnOne = learningMode === 'oneOnOne';

            return (
              <div
                key={course.id}
                className="group bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-[340px]"
              >
                {/* 封面区域 */}
                <div className="relative h-40 overflow-hidden bg-slate-100 dark:bg-slate-850 shrink-0">
                  {course.coverImage ? (
                    <img
                      src={course.coverImage}
                      alt={course.name}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : thumbnails[course.id] ? (
                    <div className="w-full h-full group-hover:scale-[1.03] transition-transform duration-300 overflow-hidden">
                      <ThumbnailSlide
                        slide={thumbnails[course.id]}
                        size={320}
                        viewportSize={thumbnails[course.id].viewportSize ?? 1000}
                        viewportRatio={thumbnails[course.id].viewportRatio ?? 0.5625}
                      />
                    </div>
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-tr ${getPlaceholderStyle(course.name)} flex flex-col justify-between p-4 text-white group-hover:scale-[1.03] transition-transform duration-300`}>
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-75">Course</span>
                      <span className="text-2xl font-black truncate">{course.name.slice(0, 1) || 'C'}</span>
                    </div>
                  )}

                  {/* 悬浮操作条 */}
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 backdrop-blur-[2px]">
                    <button
                      onClick={() => openEditDrawer(course)}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white text-white hover:text-slate-900 font-semibold text-xs border border-white/20 transition-all flex items-center gap-1"
                    >
                      <Pencil className="size-3.5" />
                      配置
                    </button>
                    {!isOneOnOne && (
                      <Link
                        href={`/admin/courses/${course.id}`}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white text-white hover:text-slate-900 font-semibold text-xs border border-white/20 transition-all flex items-center gap-1"
                      >
                        <ExternalLink className="size-3.5" />
                        编辑大纲
                      </Link>
                    )}
                    <button
                      onClick={() => openDeleteConfirm(course)}
                      className="p-2 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-semibold text-xs transition-all flex items-center gap-1"
                    >
                      <Trash2 className="size-3.5" />
                      删除
                    </button>
                  </div>

                  {/* 模式角标 */}
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    {isOneOnOne ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/90 text-white backdrop-blur-sm shadow-sm">
                        ⚔️ 一对一
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/90 text-white backdrop-blur-sm shadow-sm">
                        📖 教学
                      </span>
                    )}
                  </div>
                  
                  {/* 可见性指示 */}
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={() => togglePublish(course)}
                      className={`p-1.5 rounded-full backdrop-blur-sm border shadow-sm transition-colors text-white ${course.isPublished ? 'bg-emerald-500/80 border-emerald-400' : 'bg-slate-500/80 border-slate-400'}`}
                      title={course.isPublished ? '已公开，点击隐藏' : '已隐藏，点击公开'}
                    >
                      {course.isPublished ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                    </button>
                  </div>
                </div>

                {/* 文字详情 */}
                <div className="p-4 flex-1 flex flex-col justify-between min-w-0">
                  <div className="min-w-0 space-y-1.5">
                    {/* 分类 & 标题 */}
                    <div className="flex items-center justify-between gap-2">
                      {course.categoryId ? (
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider truncate">
                          {categories.find((c) => c.id === course.categoryId)?.name || '分类'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">未分类</span>
                      )}
                      <span className="text-[9px] text-slate-400 shrink-0 font-medium">ID: {course.id.slice(0, 8)}</span>
                    </div>

                    <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors" title={course.name}>
                      {course.name}
                    </h2>
                  </div>

                  <div className="space-y-3 mt-2 shrink-0">
                    {/* 标签区 */}
                    <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden">
                      {course.stageTags.length > 0 ? (
                        course.stageTags.slice(0, 3).map((t) => (
                          <span
                            key={t.tag.id}
                            className="px-1.5 py-0.5 text-[9px] rounded font-medium border"
                            style={{
                              color: t.tag.color || '#64748b',
                              borderColor: t.tag.color ? `${t.tag.color}30` : '#64748b30',
                              backgroundColor: t.tag.color ? `${t.tag.color}08` : '#64748b08',
                            }}
                          >
                            {t.tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[9px] text-slate-400">无标签</span>
                      )}
                      {course.stageTags.length > 3 && (
                        <span className="px-1 py-0.5 text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded font-semibold shrink-0">
                          +{course.stageTags.length - 3}
                        </span>
                      )}
                    </div>

                    {/* 一对一评分信息（可选显示） */}
                    {isOneOnOne && course.oneOnOneTagId && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                        <span className="shrink-0">评分:</span>
                        {(() => {
                          const tag = tags.find((t) => t.id === course.oneOnOneTagId);
                          const tagName = tag ? tag.name : '评分标签';
                          const tagColor = tag ? tag.color : '#64748b';
                          return (
                            <button
                              onClick={() => {
                                setPreviewTagId(course.oneOnOneTagId!);
                                setPreviewTagName(tagName);
                                setPreviewOpen(true);
                              }}
                              className="px-1.5 py-0.2 rounded border text-[9px] text-left hover:opacity-85 transition-opacity truncate"
                              style={{
                                color: tagColor || '#64748b',
                                borderColor: tagColor ? `${tagColor}30` : '#64748b30',
                                backgroundColor: tagColor ? `${tagColor}08` : '#64748b08',
                              }}
                              title="点击预览此评分标准明细"
                            >
                              {tagName}
                            </button>
                          );
                        })()}
                      </div>
                    )}

                    {/* 创建信息 */}
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-850 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate max-w-[80px]" title={course.user?.name || '管理员'}>By: {course.user?.name || '管理员'}</span>
                      <span>{new Date(course.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 精致列表视图 */
        <div className="space-y-3">
          {filteredCourses.map((course) => {
            const learningMode = deriveLearningMode(course);
            const isOneOnOne = learningMode === 'oneOnOne';

            return (
              <div
                key={course.id}
                className="group bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* 缩略图 */}
                  <div className="w-16 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-850 shrink-0 border border-slate-100 dark:border-slate-800 relative">
                    {course.coverImage ? (
                      <img
                        src={course.coverImage}
                        alt={course.name}
                        className="w-full h-full object-cover"
                      />
                    ) : thumbnails[course.id] ? (
                      <ThumbnailSlide
                        slide={thumbnails[course.id]}
                        size={64}
                        viewportSize={thumbnails[course.id].viewportSize ?? 1000}
                        viewportRatio={thumbnails[course.id].viewportRatio ?? 0.5625}
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-tr ${getPlaceholderStyle(course.name)} flex items-center justify-center text-white text-xs font-black uppercase`}>
                        {course.name.slice(0, 1) || 'C'}
                      </div>
                    )}
                  </div>

                  {/* 详情 */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate max-w-[280px]" title={course.name}>
                        {course.name}
                      </h2>
                      <span className="text-[9px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-850">ID: {course.id.slice(0, 8)}</span>
                      {course.categoryId ? (
                        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/20">
                          {categories.find((c) => c.id === course.categoryId)?.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">未分类</span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-400 font-medium">
                      <span>创建者: {course.user?.name || '管理员'}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span>{new Date(course.updatedAt).toLocaleDateString()}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <div className="flex gap-1">
                        {isOneOnOne ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100/30 dark:border-amber-900/40 text-[9px] font-semibold">⚔️ 一对一对练</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100/30 dark:border-blue-900/40 text-[9px] font-semibold">📖 教学模式</span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded border text-[9px] font-semibold ${getVisLabel(course).color}`}>
                          {getVisLabel(course).icon}
                          {getVisLabel(course).label}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 标签与操作 */}
                <div className="flex items-center gap-5 shrink-0">
                  {/* 标签展示区 */}
                  <div className="hidden lg:flex flex-wrap gap-1 max-w-[200px]">
                    {course.stageTags.slice(0, 2).map((t) => (
                      <span
                        key={t.tag.id}
                        className="px-1.5 py-0.5 text-[9px] rounded font-medium border"
                        style={{
                          color: t.tag.color || '#64748b',
                          borderColor: t.tag.color ? `${t.tag.color}30` : '#64748b30',
                          backgroundColor: t.tag.color ? `${t.tag.color}08` : '#64748b08',
                        }}
                      >
                        {t.tag.name}
                      </span>
                    ))}
                    {course.stageTags.length > 2 && (
                      <span className="px-1 py-0.5 text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded font-semibold shrink-0">
                        +{course.stageTags.length - 2}
                      </span>
                    )}
                  </div>

                  {/* 评分标签显示 */}
                  {isOneOnOne && course.oneOnOneTagId && (
                    <div className="hidden md:block shrink-0">
                      {(() => {
                        const tag = tags.find((t) => t.id === course.oneOnOneTagId);
                        const tagName = tag ? tag.name : '评分标签';
                        const tagColor = tag ? tag.color : '#64748b';
                        return (
                          <button
                            onClick={() => {
                              setPreviewTagId(course.oneOnOneTagId!);
                              setPreviewTagName(tagName);
                              setPreviewOpen(true);
                            }}
                            className="px-2 py-0.5 rounded border text-[9px] hover:opacity-85 transition-all"
                            style={{
                              color: tagColor || '#64748b',
                              borderColor: tagColor ? `${tagColor}30` : '#64748b30',
                              backgroundColor: tagColor ? `${tagColor}08` : '#64748b08',
                            }}
                            title="点击预览评分标准"
                          >
                            👁 评分标准
                          </button>
                        );
                      })()}
                    </div>
                  )}

                  {/* 操作区 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditDrawer(course)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-500 hover:text-slate-850 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                      title="配置属性"
                    >
                      <Pencil className="size-4" />
                    </button>
                    {!isOneOnOne && (
                      <Link
                        href={`/admin/courses/${course.id}`}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
                        title="编辑内容大纲"
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                    )}
                    <button
                      onClick={() => openDeleteConfirm(course)}
                      className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/50 text-red-500 hover:text-red-700 transition-colors"
                      title="删除课程"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 评分预览弹窗 */}
      <ScoringConfigPreviewDialog
        tagId={previewTagId}
        tagName={previewTagName}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      {/* 右侧属性配置抽屉 Drawer */}
      <AnimatePresence>
        {drawerOpen && selectedCourse && (
          <>
            {/* 半透明黑色遮罩 overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black backdrop-blur-[1px]"
            />

            {/* 抽屉主体 */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    配置课程属性
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">ID: {selectedCourse.id}</p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* 1. 课程封面 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">课程封面</label>
                  <div className="flex gap-4 items-center">
                    <div className="w-24 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center shrink-0">
                      {draftCoverImage ? (
                        <img src={draftCoverImage} alt="封面预览" className="w-full h-full object-cover" />
                      ) : (
                        <Image className="size-6 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="外链图片 URL"
                        value={draftCoverImage.startsWith('data:') ? '(Base64图片，上传新图可覆盖)' : draftCoverImage}
                        onChange={(e) => {
                          if (!e.target.value.startsWith('(Base64')) {
                            setDraftCoverImage(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleCoverFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => coverInputRef.current?.click()}
                          className="px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors"
                        >
                          选择本地图片
                        </button>
                        {draftCoverImage && (
                          <button
                            type="button"
                            onClick={() => setDraftCoverImage('')}
                            className="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-100 text-[11px] font-semibold transition-colors"
                          >
                            移除封面
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. 课程名称 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">课程名称</label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="输入课程名称"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* 3. 所属分类 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">课程分类</label>
                  <CategorySelector
                    categories={categories}
                    value={draftCategory}
                    onChange={setDraftCategory}
                  />
                </div>

                {/* 4. 评分规则配置 (只有对练模式显示) */}
                {deriveLearningMode(selectedCourse) === 'oneOnOne' && (
                  <div className="space-y-2 bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl">
                    <label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                      一对一评分标准绑定
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={draftOneOnOneTagId || ''}
                        onChange={(e) => setDraftOneOnOneTagId(e.target.value || null)}
                        className="flex-1 h-9 px-3 text-xs rounded-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="">使用系统默认评分</option>
                        {tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>
                      {draftOneOnOneTagId && (
                        <button
                          type="button"
                          onClick={() => {
                            const tag = tags.find((t) => t.id === draftOneOnOneTagId);
                            setPreviewTagId(draftOneOnOneTagId);
                            setPreviewTagName(tag ? tag.name : '');
                            setPreviewOpen(true);
                          }}
                          className="px-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 text-amber-600 hover:text-amber-700 text-xs flex items-center gap-1 transition-colors"
                        >
                          <Eye className="size-3.5" />
                          预览
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. 课程标签配置 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">课程展示标签 (多选)</label>
                  <div className="flex flex-wrap gap-1.5 border border-slate-200 dark:border-slate-800 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 max-h-36 overflow-y-auto">
                    {tags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleDraftTag(t.id)}
                        className={`px-2 py-0.5 text-xs rounded-lg border transition-all ${draftTags.includes(t.id) ? 'shadow-sm font-semibold' : 'opacity-40 grayscale hover:opacity-80'}`}
                        style={{
                          borderColor: t.color || '#64748b',
                          color: t.color || '#64748b',
                          backgroundColor: draftTags.includes(t.id)
                            ? t.color
                              ? t.color + '10'
                              : '#64748b10'
                            : 'transparent',
                        }}
                      >
                        {draftTags.includes(t.id) && <Check className="size-3 inline-block mr-1 -ml-0.5" />}
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. 可见性与权限管控 */}
                <div className="space-y-3.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">可见范围管理</label>
                  
                  {/* 可见性卡片选择器 */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'all', label: '全员公开', icon: '🌍', desc: '所有人皆可学习该课程' },
                      { value: 'roles', label: '指定范围', icon: '🔒', desc: '仅特定角色或用户可见' },
                      { value: 'hidden', label: '彻底隐藏', icon: '👁️‍🌫️', desc: '仅管理员可在后台编辑' }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDraftVisMode(opt.value as VisibilityMode)}
                        className={`p-2.5 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between h-20 ${
                          draftVisMode === opt.value
                            ? 'border-blue-500 bg-blue-500/[0.03] text-blue-600 dark:text-blue-400 font-medium shadow-sm ring-1 ring-blue-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 hover:bg-slate-50/80 dark:hover:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex justify-between w-full items-center">
                          <span className="text-base">{opt.icon}</span>
                          {draftVisMode === opt.value && (
                            <div className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white flex items-center justify-center">
                              <Check className="size-2" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-[11px] font-bold tracking-tight">{opt.label}</div>
                          <div className="text-[9px] text-slate-400 dark:text-slate-500 truncate scale-95 origin-left">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 角色与用户子编辑 */}
                  {draftVisMode === 'roles' && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800 bg-slate-50/30 dark:bg-slate-900/10">
                      
                      {/* Accordion 1: 角色授权 */}
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => setActiveAccordion(activeAccordion === 'roles' ? null : 'roles')}
                          className="w-full px-4 py-3 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">🔑 授权角色访问</span>
                            {draftVisRoles.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                                已选 {draftVisRoles.length}
                              </span>
                            )}
                          </div>
                          <ChevronDown className={cn("size-4 text-slate-400 transition-transform duration-200", activeAccordion === 'roles' && "rotate-180")} />
                        </button>

                        {activeAccordion === 'roles' && (
                          <div className="p-3.5 bg-white dark:bg-slate-950/60 space-y-3.5 border-t border-slate-150 dark:border-slate-900 transition-all duration-300">
                            {/* 角色搜索 */}
                            <div className="relative flex items-center border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1 bg-white dark:bg-slate-900/60 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                              <Search className="size-3 text-slate-400 shrink-0 mr-1.5" />
                              <input
                                type="text"
                                value={roleSearchQuery}
                                onChange={(e) => setRoleSearchQuery(e.target.value)}
                                placeholder="搜索角色..."
                                className="w-full bg-transparent border-none outline-none text-[11px] text-slate-700 dark:text-slate-300 placeholder-slate-400 p-0"
                              />
                              {roleSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setRoleSearchQuery('')}
                                  className="text-[11px] text-slate-400 hover:text-slate-655"
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            {/* 角色 2x2 精致卡片网格 */}
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { label: 'admin', title: '系统管理员', icon: '👑', desc: '全功能管理及权限管控' },
                                { label: 'manager', title: '运营经理', icon: '💼', desc: '课程分配与数据监控' },
                                { label: 'teacher', title: '授课教师', icon: '🎓', desc: '对练打分与课件创建' },
                                { label: 'user', title: '普通学员', icon: '👤', desc: '标准注册学生用户' }
                              ]
                                .filter(item => item.label.includes(roleSearchQuery.toLowerCase()) || item.title.includes(roleSearchQuery))
                                .map((item) => {
                                  const active = draftVisRoles.includes(item.label);
                                  return (
                                    <button
                                      key={item.label}
                                      type="button"
                                      onClick={() =>
                                        setDraftVisRoles((prev) =>
                                          prev.includes(item.label) ? prev.filter((r) => r !== item.label) : [...prev, item.label],
                                        )
                                      }
                                      className={cn(
                                        "p-2.5 rounded-xl border text-left transition-all duration-200 relative group flex flex-col justify-between h-20 select-none",
                                        active
                                          ? "border-blue-500 bg-blue-500/[0.03] text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/5 ring-1 ring-blue-500/20"
                                          : "border-slate-100 dark:border-slate-900 bg-slate-50/20 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                                      )}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span className="text-base group-hover:scale-110 transition-transform duration-200">{item.icon}</span>
                                        {active ? (
                                          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white flex items-center justify-center">
                                            <Check className="size-2" />
                                          </div>
                                        ) : (
                                          <div className="w-3.5 h-3.5 rounded-full border border-slate-200 dark:border-slate-800" />
                                        )}
                                      </div>
                                      <div className="mt-1">
                                        <div className="text-[11px] font-bold tracking-tight">{item.title}</div>
                                        <div className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight scale-90 -ml-[5%] w-[110%] truncate">{item.desc}</div>
                                      </div>
                                    </button>
                                  );
                                })}
                              {AVAILABLE_ROLES.filter(role => role.includes(roleSearchQuery.toLowerCase())).length === 0 && (
                                <div className="col-span-2 text-center text-xs text-slate-400 py-3">无匹配的角色</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Accordion 2: 特许人员 */}
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => setActiveAccordion(activeAccordion === 'users' ? null : 'users')}
                          className="w-full px-4 py-3 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">👤 特许人员授权</span>
                            {draftVisUsers.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                                已选 {draftVisUsers.length}
                              </span>
                            )}
                          </div>
                          <ChevronDown className={cn("size-4 text-slate-400 transition-transform duration-200", activeAccordion === 'users' && "rotate-180")} />
                        </button>

                        {activeAccordion === 'users' && (
                          <div className="p-3.5 bg-white dark:bg-slate-950/60 space-y-3 border-t border-slate-150 dark:border-slate-900 transition-all duration-300">
                            {/* 用户搜索 */}
                            <div className="relative flex items-center border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 bg-white dark:bg-slate-900/60 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                              <Search className="size-3.5 text-slate-400 shrink-0 mr-1.5" />
                              <input
                                type="text"
                                value={userSearchQuery}
                                onChange={(e) => setUserSearchQuery(e.target.value)}
                                placeholder="输入用户名、邮箱或角色搜索..."
                                className="w-full bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 p-0"
                              />
                              {userSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setUserSearchQuery('')}
                                  className="text-xs text-slate-450 hover:text-slate-655 px-1"
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            {/* 过滤切换 Tab */}
                            <div className="flex border-b border-slate-100 dark:border-slate-900 p-0.5 bg-slate-100/50 dark:bg-slate-900/40 rounded-lg">
                              <button
                                type="button"
                                onClick={() => setShowSelectedOnly(false)}
                                className={cn(
                                  "flex-1 py-1 text-[10px] font-medium rounded-md transition-all",
                                  !showSelectedOnly
                                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                                )}
                              >
                                全部用户 ({allUsers.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowSelectedOnly(true)}
                                className={cn(
                                  "flex-1 py-1 text-[10px] font-medium rounded-md transition-all",
                                  showSelectedOnly
                                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                                )}
                              >
                                已选授权 ({draftVisUsers.length})
                              </button>
                            </div>

                            {/* 用户列表 */}
                            <div className="max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-850 rounded-xl p-1 bg-white dark:bg-slate-900/10 divide-y divide-slate-100 dark:divide-slate-850/60">
                              {filteredUsers.map((u) => {
                                const selected = draftVisUsers.includes(u.id);
                                const nameInitial = u.name ? u.name.substring(0, 1).toUpperCase() : 'U';
                                return (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() =>
                                      setDraftVisUsers((prev) =>
                                        prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id],
                                      )
                                    }
                                    className={cn(
                                      "w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-all duration-150 flex items-center gap-2 group relative my-0.5",
                                      selected
                                        ? "bg-blue-50/70 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                                        : "hover:bg-slate-50 dark:hover:bg-slate-850/60 text-slate-600 dark:text-slate-400"
                                    )}
                                  >
                                    {/* 用户名首字母头像占位 */}
                                    <div className={cn(
                                      "w-5.5 h-5.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 shadow-sm",
                                      selected
                                        ? "bg-blue-500 text-white dark:bg-blue-600"
                                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-450 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                                    )}>
                                      {nameInitial}
                                    </div>

                                    <div className="flex flex-col min-w-0">
                                      <span className="truncate text-slate-800 dark:text-slate-200 font-medium">{u.name}</span>
                                      {u.email && (
                                        <span className="text-[9px] text-slate-450 truncate scale-95 origin-left">{u.email}</span>
                                      )}
                                    </div>

                                    <div className="ml-auto flex items-center gap-1.5">
                                      {/* 角色标识 */}
                                      <span className="text-[8px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-850 text-slate-400 dark:text-slate-500 scale-90 font-mono">
                                        {u.role}
                                      </span>
                                      {selected ? (
                                        <div className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm">
                                          <Check className="size-2" />
                                        </div>
                                      ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border border-slate-200 dark:border-slate-800 group-hover:border-slate-350 dark:group-hover:border-slate-700 transition-colors" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                              {filteredUsers.length === 0 && (
                                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center gap-1">
                                  <span className="text-base">🔍</span>
                                  <span>未找到相关用户</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                <button
                  type="button"
                  onClick={saveDrawerChanges}
                  className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center"
                >
                  保存修改
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-5 h-11 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-semibold rounded-xl transition-all"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 二阶段安全危险删除弹窗 */}
      <AnimatePresence>
        {deleteConfirmOpen && courseToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmOpen(false)}
              className="fixed inset-0 bg-slate-900 backdrop-blur-[2px]"
            />

            {/* 模态框主体 */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md shadow-2xl relative z-10 border border-red-200/55 dark:border-red-900/30 overflow-hidden"
            >
              <div className="flex gap-4 items-start">
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-2xl shrink-0 animate-bounce">
                  <AlertTriangle className="size-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">确认要永久删除该课程吗？</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    本操作属于高风险危险操作。删除后将永久清除：
                  </p>
                  <ul className="text-xs text-red-600/90 dark:text-red-400/90 list-disc list-inside mt-2 space-y-1 font-medium bg-red-50/30 dark:bg-red-950/10 p-3 rounded-2xl">
                    <li>此课程的大纲幻灯片和课件配置</li>
                    <li>所有相关的用户选课信息及进度记录</li>
                    <li>所有的一对一对练实战录音及历史评分报告</li>
                  </ul>
                </div>
              </div>

              {/* 输入课程名字进行二次验证 */}
              <div className="mt-5 space-y-2">
                <label className="text-[11px] font-semibold text-slate-400 block">
                  请输入完整的课程名称进行安全校验：
                </label>
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 select-all">
                  {courseToDelete.name}
                </div>
                <input
                  type="text"
                  placeholder="在此完整复制或输入上述名称"
                  value={deleteInputName}
                  onChange={(e) => setDeleteInputName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleDeleteCourse}
                  disabled={deleting || deleteInputName.trim() !== courseToDelete.name}
                  className="flex-1 h-11 bg-red-600 hover:bg-red-700 disabled:bg-slate-100 dark:disabled:bg-slate-850 disabled:text-slate-400 text-white font-bold rounded-xl shadow-lg shadow-red-500/10 hover:shadow-red-500/20 transition-all flex items-center justify-center"
                >
                  {deleting ? '正在永久删除...' : '我同意，确认删除'}
                </button>
                <button
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-5 h-11 border border-slate-200 dark:border-slate-850 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
