"use client";

import { useState, useTransition } from "react";
import { createBookmark, updateBookmark, deleteBookmark } from "@/app/actions/bookmarks";

type Bookmark = {
  id: number;
  scope: string;
  name: string;
  keywords: string | null;
  url: string;
};

export function BookmarkManager({
  bookmarks,
  isAdmin,
}: {
  bookmarks: Bookmark[];
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState<"shared" | "personal" | null>(null);

  const shared = bookmarks.filter((b) => b.scope === "shared");
  const personal = bookmarks.filter((b) => b.scope === "personal");

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(() => deleteBookmark(id));
  }

  return (
    <div className="space-y-6">
      {/* 공통 북마크 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">공통 북마크</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">전 직원이 검색(/)에서 사용할 수 있는 공유 사이트</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAdd(showAdd === "shared" ? null : "shared")}
              className="text-xs text-[#1a2e4a] font-medium hover:underline"
            >
              + 추가
            </button>
          )}
        </div>

        {showAdd === "shared" && (
          <AddForm
            scope="shared"
            onDone={() => setShowAdd(null)}
            isPending={isPending}
            startTransition={startTransition}
          />
        )}

        {shared.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">등록된 공통 북마크가 없습니다</p>
        ) : (
          <div className="space-y-1">
            {shared.map((bm) => (
              <BookmarkRow
                key={bm.id}
                bookmark={bm}
                canEdit={isAdmin}
                editing={editingId === bm.id}
                onEdit={() => setEditingId(editingId === bm.id ? null : bm.id)}
                onDelete={() => handleDelete(bm.id)}
                isPending={isPending}
                startTransition={startTransition}
                onDone={() => setEditingId(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 개인 북마크 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">내 북마크</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">본인만 검색(/)에서 사용할 수 있는 개인 사이트</p>
          </div>
          <button
            onClick={() => setShowAdd(showAdd === "personal" ? null : "personal")}
            className="text-xs text-[#1a2e4a] font-medium hover:underline"
          >
            + 추가
          </button>
        </div>

        {showAdd === "personal" && (
          <AddForm
            scope="personal"
            onDone={() => setShowAdd(null)}
            isPending={isPending}
            startTransition={startTransition}
          />
        )}

        {personal.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">등록된 개인 북마크가 없습니다</p>
        ) : (
          <div className="space-y-1">
            {personal.map((bm) => (
              <BookmarkRow
                key={bm.id}
                bookmark={bm}
                canEdit={true}
                editing={editingId === bm.id}
                onEdit={() => setEditingId(editingId === bm.id ? null : bm.id)}
                onDelete={() => handleDelete(bm.id)}
                isPending={isPending}
                startTransition={startTransition}
                onDone={() => setEditingId(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddForm({
  scope,
  onDone,
  isPending,
  startTransition,
}: {
  scope: string;
  onDone: () => void;
  isPending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  return (
    <form
      className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2"
      action={(formData) => {
        startTransition(async () => {
          await createBookmark(formData);
          onDone();
        });
      }}
    >
      <input type="hidden" name="scope" value={scope} />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="name"
          placeholder="이름 (예: 홈택스)"
          required
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
        />
        <input
          name="url"
          placeholder="URL (예: hometax.go.kr)"
          required
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
        />
      </div>
      <input
        name="keywords"
        placeholder="검색 키워드 (쉼표 구분, 예: 홈택스, hometax, 국세청)"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="text-xs text-gray-500 px-3 py-1.5 hover:bg-gray-100 rounded-lg">
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="text-xs bg-[#1a2e4a] text-white px-4 py-1.5 rounded-lg hover:bg-[#243d61] disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </form>
  );
}

function BookmarkRow({
  bookmark,
  canEdit,
  editing,
  onEdit,
  onDelete,
  isPending,
  startTransition,
  onDone,
}: {
  bookmark: Bookmark;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
  startTransition: (fn: () => void) => void;
  onDone: () => void;
}) {
  if (editing) {
    return (
      <form
        className="p-3 bg-blue-50/50 rounded-lg space-y-2"
        action={(formData) => {
          startTransition(async () => {
            await updateBookmark(formData);
            onDone();
          });
        }}
      >
        <input type="hidden" name="id" value={bookmark.id} />
        <div className="grid grid-cols-2 gap-2">
          <input
            name="name"
            defaultValue={bookmark.name}
            required
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
          />
          <input
            name="url"
            defaultValue={bookmark.url}
            required
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
          />
        </div>
        <input
          name="keywords"
          defaultValue={bookmark.keywords ?? ""}
          placeholder="검색 키워드 (쉼표 구분)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onDone} className="text-xs text-gray-500 px-3 py-1.5 hover:bg-gray-100 rounded-lg">
            취소
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="text-xs bg-[#1a2e4a] text-white px-4 py-1.5 rounded-lg hover:bg-[#243d61] disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 group">
      <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{bookmark.name}</div>
        <div className="text-[11px] text-gray-400 truncate">
          {bookmark.url.replace(/^https?:\/\//, "").split("/")[0]}
          {bookmark.keywords && (
            <span className="ml-2 text-gray-300">| {bookmark.keywords}</span>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="text-[11px] text-gray-400 hover:text-[#1a2e4a] px-2 py-1 rounded hover:bg-gray-100">
            수정
          </button>
          <button onClick={onDelete} disabled={isPending} className="text-[11px] text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50">
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
