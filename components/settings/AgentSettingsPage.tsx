"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTIVE_AGENT_STORAGE_KEY, AGENT_PROFILES_STORAGE_KEY, AgentProfile } from "@/state/agentProfilesStorage";
import { DashboardRuntimeConfig, useDashboardRuntimeConfig } from "@/state/useDashboardRuntimeConfig";

function cloneConfig(config: DashboardRuntimeConfig): DashboardRuntimeConfig {
  return JSON.parse(JSON.stringify(config)) as DashboardRuntimeConfig;
}

export function AgentSettingsPage() {
  const { config, setConfig } = useDashboardRuntimeConfig();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    try {
      const rawProfiles = window.localStorage.getItem(AGENT_PROFILES_STORAGE_KEY);
      const rawActive = window.localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY);
      if (!rawProfiles) {
        const id = crypto.randomUUID();
        const starter: AgentProfile = {
          id,
          name: "Default Support Agent",
          description: "Starter agent profile.",
          config: cloneConfig(config)
        };
        setProfiles([starter]);
        setActiveId(id);
        setName(starter.name);
        setDescription(starter.description);
        setInstructions(starter.config.agentInstructions ?? "");
        return;
      }
      const parsed = JSON.parse(rawProfiles) as AgentProfile[];
      const resolvedActiveId = parsed.some((p) => p.id === rawActive) ? (rawActive as string) : parsed[0]?.id;
      const activeProfile = parsed.find((p) => p.id === resolvedActiveId) ?? parsed[0];
      setProfiles(parsed);
      setActiveId(resolvedActiveId);
      setName(activeProfile?.name ?? "");
      setDescription(activeProfile?.description ?? "");
      setInstructions(activeProfile?.config.agentInstructions ?? "");
      if (activeProfile?.config) setConfig(() => cloneConfig(activeProfile.config));
    } catch {
      setProfiles([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profiles.length) return;
    window.localStorage.setItem(AGENT_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    if (!activeId) return;
    window.localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, activeId);
  }, [activeId]);

  const activeProfile = useMemo(() => profiles.find((p) => p.id === activeId), [profiles, activeId]);

  const applyProfile = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    setActiveId(id);
    setName(profile.name);
    setDescription(profile.description);
    setInstructions(profile.config.agentInstructions ?? "");
    setConfig(() => cloneConfig(profile.config));
  };

  const saveProfile = () => {
    if (!activeId) return;
    setProfiles((prev) => prev.map((profile) => profile.id === activeId
      ? {
          ...profile,
          name: name.trim() || profile.name,
          description: description.trim(),
          config: { ...cloneConfig(profile.config), agentInstructions: instructions.trim() }
        }
      : profile));
    setConfig((prev) => ({ ...prev, agentInstructions: instructions.trim() }));
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Agent Settings</h1>
      <p className="text-sm text-slate-600">Update per-agent instructions. Each saved agent can have different instruction text.</p>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Active agent</span>
          <select className="w-full rounded-lg border border-slate-300 p-2" value={activeId} onChange={(e) => applyProfile(e.target.value)}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Agent name</span>
          <input className="w-full rounded-lg border border-slate-300 p-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Description</span>
          <textarea className="min-h-16 w-full rounded-lg border border-slate-300 p-2" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Agent instructions</span>
          <textarea className="min-h-44 w-full rounded-lg border border-blue-300 p-2" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Add custom behavior instructions for this specific agent profile." />
        </label>
        <button type="button" onClick={saveProfile} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">Save instructions</button>
      </section>

      {activeProfile && <p className="text-xs text-slate-500">Saved profile: <strong>{activeProfile.name}</strong></p>}
    </main>
  );
}
