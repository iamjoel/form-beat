import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getExercise, type ExerciseId } from "@workout-detect/core/domain/exercises";
import { App, type SaveState } from "./App";
import type { MotionProject } from "./lib/editor-model";
import {
  getMotion,
  listMotions,
  publishMotion,
  updateMotion,
  type MotionStatus,
  type MotionSummary,
  type StoredMotion,
} from "./lib/motion-api";

function Brand() {
  return (
    <div className="brand-lockup" aria-label="Form Beat Motion Lab">
      <span className="brand-mark"><span /></span>
      <div>
        <strong>FORM BEAT</strong>
        <span>MOTION LAB</span>
      </div>
    </div>
  );
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1_000).toFixed(durationMs % 1_000 === 0 ? 0 : 1)} 秒`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function MotionListPage({ navigate }: { navigate: (path: string) => void }) {
  const [motions, setMotions] = useState<MotionSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listMotions(search)
        .then((items) => {
          if (!active) return;
          setMotions(items);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "读取动作列表失败");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, search ? 180 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  const readyCount = useMemo(
    () => motions.filter((motion) => motion.status === "ready").length,
    [motions],
  );

  return (
    <main className="library-page">
      <header className="library-header">
        <Brand />
        <div className="library-heading">
          <span>健身内容后台</span>
          <h1>动作数据</h1>
        </div>
        <div className="database-status"><i /> SQLite 本地库</div>
      </header>

      <section className="library-main">
        <div className="library-intro">
          <div>
            <span className="eyebrow">MOTION DATASET</span>
            <h2>动作项目列表</h2>
            <p>创建、标注并维护可导出为 JSON 和 GIF 的哈士奇健身动作。</p>
          </div>
          <div className="library-stats" aria-label="动作统计">
            <div><strong>{motions.length}</strong><span>当前结果</span></div>
            <div><strong>{readyCount}</strong><span>已就绪</span></div>
          </div>
        </div>

        <section className="skill-creation-notice" aria-label="通过 Skill 创建健身动作">
          <div className="skill-notice-title">
            <span>CREATE VIA SKILL</span>
            <strong>动作由 Skill 创建</strong>
          </div>
          <p>
            在 Codex 中调用 <code>$create-fitness-motion</code>，描述动作名称、类型和时长。
            创建完成后，数据会自动写入 SQLite 并出现在下方列表。
          </p>
          <div className="skill-command" aria-label="Skill 名称">
            <i>$</i><strong>create-fitness-motion</strong><span>→ SQLite</span>
          </div>
        </section>

        <div className="library-toolbar">
          <label className="motion-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索名称或动作类型"
              aria-label="搜索动作"
            />
            {search ? <button type="button" onClick={() => setSearch("")} aria-label="清除搜索">×</button> : null}
          </label>
          <span>{loading ? "正在同步…" : `${motions.length} 条数据`}</span>
        </div>

        {error ? <div className="library-error" role="alert">{error}</div> : null}

        <section className="motion-table" aria-label="健身动作列表">
          <div className="motion-table-head">
            <span>动作名称</span><span>类型</span><span>时长</span><span>关键帧</span><span>状态</span><span>更新时间</span><span />
          </div>
          {!loading && motions.length === 0 ? (
            <div className="motion-empty">
              <span>00</span>
              <h3>{search ? "没有匹配的动作" : "还没有动作数据"}</h3>
              <p>{search ? "换个关键词试试。" : "调用 $create-fitness-motion 创建第一条健身动作。"}</p>
            </div>
          ) : null}
          {motions.map((motion, index) => (
            <button
              className="motion-row"
              key={motion.id}
              onClick={() => navigate(`/editor/${encodeURIComponent(motion.id)}`)}
            >
              <span className="motion-primary">
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span><strong>{motion.name}</strong><small>{motion.id}</small></span>
              </span>
              <span>{getExercise(motion.exerciseId as ExerciseId).label}</span>
              <span>{formatDuration(motion.durationMs)}</span>
              <span>{motion.keyframeCount}</span>
              <span><em className={`status-badge is-${motion.status}`}>{motion.status === "ready" ? "已发布" : "草稿"}</em></span>
              <span>{formatUpdatedAt(motion.updatedAt)}</span>
              <span className="row-arrow">→</span>
            </button>
          ))}
        </section>
      </section>
    </main>
  );
}

function EditorPage({ id, navigate }: { id: string; navigate: (path: string) => void }) {
  const [motion, setMotion] = useState<StoredMotion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<MotionProject | null>(null);
  const pendingStatusRef = useRef<MotionStatus | undefined>(undefined);
  const statusRef = useRef<MotionStatus>("draft");
  const savedJsonRef = useRef("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void getMotion(id)
      .then((record) => {
        setMotion(record);
        statusRef.current = record.status;
        savedJsonRef.current = JSON.stringify(record.project);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "读取动作失败"));
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (pendingRef.current) {
        void updateMotion(id, pendingRef.current, pendingStatusRef.current);
      }
    };
  }, [id]);

  const savePending = useCallback(async () => {
    const project = pendingRef.current;
    if (!project) return;
    const status = pendingStatusRef.current;
    pendingRef.current = null;
    pendingStatusRef.current = undefined;
    const serialized = JSON.stringify(project);
    try {
      const updated = await updateMotion(id, project, status);
      statusRef.current = updated.status;
      if (mountedRef.current) setMotion(updated);
      savedJsonRef.current = serialized;
      if (mountedRef.current && !pendingRef.current) setSaveState("saved");
    } catch {
      if (!pendingRef.current) {
        pendingRef.current = project;
        pendingStatusRef.current = status;
      }
      if (mountedRef.current) setSaveState("error");
    }
  }, [id]);

  const handleProjectChange = useCallback((project: MotionProject) => {
    const serialized = JSON.stringify(project);
    if (serialized === savedJsonRef.current) return;
    pendingRef.current = project;
    if (statusRef.current === "ready") {
      statusRef.current = "draft";
      pendingStatusRef.current = "draft";
      setMotion((current) => current ? { ...current, status: "draft" } : current);
    }
    setSaveState("saving");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void savePending();
    }, 350);
  }, [savePending]);

  const handlePublish = useCallback(async (project: MotionProject) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = project;
    await savePending();
    const result = await publishMotion(id, project);
    savedJsonRef.current = JSON.stringify(result.motion.project);
    statusRef.current = result.motion.status;
    if (mountedRef.current) {
      setMotion(result.motion);
      setSaveState("saved");
    }
  }, [id, savePending]);

  const handleBack = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    void savePending().finally(() => navigate("/"));
  }, [navigate, savePending]);

  if (error) {
    return (
      <main className="editor-gate">
        <Brand />
        <div><span>无法打开动作</span><h1>{error}</h1><button onClick={() => navigate("/")}>返回列表</button></div>
      </main>
    );
  }
  if (!motion) {
    return <main className="editor-loading"><span className="spinner" /> 正在读取 SQLite 数据…</main>;
  }
  return (
    <App
      key={motion.id}
      initialProject={motion.project}
      onProjectChange={handleProjectChange}
      onBack={handleBack}
      isPublished={motion.status === "ready"}
      onPublish={handlePublish}
      saveState={saveState}
    />
  );
}

export function AdminApp() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }, []);

  const editorMatch = path.match(/^\/editor\/([^/]+)\/?$/);
  if (editorMatch) return <EditorPage id={decodeURIComponent(editorMatch[1])} navigate={navigate} />;
  return <MotionListPage navigate={navigate} />;
}
