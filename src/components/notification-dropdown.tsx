"use client";

import { useEffect, useRef, useState } from "react";
import type { SystemUpdate } from "@/lib/types";

const LAST_SEEN_KEY = "admin_web_last_seen_changelog";

export function NotificationDropdown({ updates }: { updates: SystemUpdate[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnreadCount(updates.length);
    } else {
      const unseenIndex = updates.findIndex((item) => item.version === lastSeen);
      if (unseenIndex === -1) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUnreadCount(updates.length);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUnreadCount(unseenIndex);
      }
    }
  }, [updates]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => {
      if (!prev) {
        setUnreadCount(0);
        if (updates.length > 0) {
          localStorage.setItem(LAST_SEEN_KEY, updates[0].version);
        }
      }
      return !prev;
    });
  };

  const formatDateLabel = (dateRaw: string) => {
    const date = new Date(dateRaw);
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200/60 text-slate-600 hover:bg-slate-900 hover:text-white transition-all duration-300 ml-2 shadow-sm hover:shadow-md hover:-translate-y-[1px]"
        aria-label="Notifikasi Update"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
           <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 ring-2 ring-white text-[9px] font-bold text-white shadow-sm animate-pulse">
             {unreadCount > 9 ? "9+" : unreadCount}
           </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 lg:-left-2 mt-3 w-[min(340px,90vw)] rounded-2xl bg-white shadow-[0_12px_45px_rgba(0,0,0,0.12)] border border-slate-200 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
            <h3 className="font-bold text-slate-900 text-[15px]">Notifikasi Update</h3>
            <span className="text-[11px] font-semibold text-slate-500">
              {updates.length} Rilis
            </span>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
            {updates.length === 0 ? (
              <div className="px-5 py-8 text-center bg-slate-50 flex items-center justify-center h-40">
                <span className="text-sm font-medium text-slate-400">Belum ada update peluncuran fitur.</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {updates.map((update, idx) => {
                  const isUnread = idx < unreadCount;
                  
                  return (
                    <li 
                      key={update.id} 
                      className={`block px-4 py-3.5 transition-colors duration-200 cursor-default hover:bg-slate-50 ${isUnread ? 'bg-indigo-50/40' : ''}`}
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-0.5 relative">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${isUnread && update.type !== "announcement" ? 'bg-indigo-600 text-white' : isUnread && update.type === "announcement" ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {update.type === "announcement" ? (
                              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                <line x1="12" y1="22.08" x2="12" y2="12"></line>
                              </svg>
                            )}
                          </span>
                          {/* Dot Notifikasi Baru */}
                          {isUnread && (
                            <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white bg-indigo-500"></span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm tracking-tight ${isUnread ? (update.type === "announcement" ? 'font-bold text-sky-950' : 'font-bold text-indigo-950') : 'font-semibold text-slate-800'}`}>
                            {update.type === "announcement" ? `Pengumuman: ${update.version}` : `Web Administratif ${update.version} Dirilis!`}
                          </p>
                          <div className="mt-1 space-y-1">
                            {update.features.slice(0, 2).map((feat, i) => (
                              <p key={i} className={`text-xs block ${isUnread ? 'text-indigo-800/80' : 'text-slate-500'}`}>
                                <span className="mr-1 text-[10px] opacity-70">✦</span> 
                                {feat}
                              </p>
                            ))}
                            {update.features.length > 2 && (
                              <p className="text-[11px] font-medium text-slate-400 italic">
                                + {update.features.length - 2} fitur lainnya
                              </p>
                            )}
                          </div>
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {formatDateLabel(update.releaseDate)}
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
