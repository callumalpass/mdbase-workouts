import { useState } from "react";
import TodayTab from "./components/TodayTab";
import CalendarTab from "./components/CalendarTab";
import HistoryTab from "./components/HistoryTab";
import ChatTab from "./components/ChatTab";
import SettingsSheet from "./components/SettingsSheet";
import { haptics } from "./lib/haptics";

type Tab = "today" | "calendar" | "history" | "chat";

const TABS: Tab[] = ["today", "calendar", "history", "chat"];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [showSettings, setShowSettings] = useState(false);

  const tabIndex = TABS.indexOf(tab);

  const handleTab = (t: Tab) => {
    haptics.tap();
    setTab(t);
  };

  return (
    <div className="flex flex-col h-[100dvh]">
      <button
        onClick={() => setShowSettings(true)}
        className="fixed top-3 right-3 z-30 w-9 h-9 flex items-center justify-center
          text-faded active:text-ink transition-colors"
        aria-label="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]">
          <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
        </svg>
      </button>
      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} />
      <main className="flex-1 overflow-y-auto">
        {tab === "today" && <TodayTab />}
        {tab === "calendar" && <CalendarTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "chat" && <ChatTab />}
      </main>
      <nav className="flex border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] relative">
        <span
          className="absolute top-0 h-[2px] bg-blush transition-all duration-200 ease-out"
          style={{ left: `calc(${tabIndex * 25}% + 1rem)`, width: "calc(25% - 2rem)" }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => handleTab(t)}
            className={`flex-1 py-3 flex flex-col items-center transition-colors ${
              tab === t ? "text-blush" : "text-faded"
            }`}
          >
            <span className="text-sm italic">{t}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
