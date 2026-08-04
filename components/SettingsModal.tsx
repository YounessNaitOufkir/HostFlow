import React, { useState } from "react";
import { X, Building2, Users, Layout, Webhook, Bell, Type, Check } from "lucide-react";
import { OrganizationSettings, Team, GlobalStatusLabel, Profile } from "@/types";
import { supabase } from "@/lib/supabase";
import { reportMutationError, reportSuccess } from "@/lib/errorReporting";
import { useFont } from "@/components/FontProvider";

interface SettingsModalProps {
  onClose: () => void;
  organizationSettings: OrganizationSettings | null;
  teams: Team[];
  globalStatusLabels: GlobalStatusLabel[];
  profiles: Profile[];
  onGlobalSettingsChanged: () => void;
}

export default function SettingsModal({
  onClose,
  organizationSettings,
  teams,
  globalStatusLabels,
  profiles,
  onGlobalSettingsChanged,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"organization" | "users" | "board" | "readability" | "integrations" | "notifications">("organization");
  const [loading, setLoading] = useState(false);

  // Form State
  const [companyName, setCompanyName] = useState(organizationSettings?.company_name || "");
  const [primaryColor, setPrimaryColor] = useState(organizationSettings?.primary_color || "#0073ea");
  const [defaultTimezone, setDefaultTimezone] = useState(organizationSettings?.default_timezone || "UTC");

  const saveOrganizationSettings = async () => {
    setLoading(true);
    try {
      if (organizationSettings) {
        await supabase.from("organization_settings").update({
          company_name: companyName,
          primary_color: primaryColor,
          default_timezone: defaultTimezone,
        }).eq("id", organizationSettings.id);
      } else {
        await supabase.from("organization_settings").insert({
          company_name: companyName,
          primary_color: primaryColor,
          default_timezone: defaultTimezone,
        });
      }
      onGlobalSettingsChanged();
      reportSuccess("Settings saved successfully");
    } catch (err) {
      reportMutationError(err, "Failed to save settings", { table: "organization_settings" });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "organization", label: "Organization", icon: Building2 },
    { id: "users", label: "Users & Teams", icon: Users },
    { id: "board", label: "Board Defaults", icon: Layout },
    { id: "readability", label: "Readability & Font", icon: Type },
    { id: "integrations", label: "Integrations", icon: Webhook },
    { id: "notifications", label: "Notifications", icon: Bell },
  ] as const;

  return (
    <div className="fixed inset-0 z-[100] flex bg-white dark:bg-slate-900 animate-in fade-in duration-200">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 flex flex-col h-full">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 md:hidden">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="absolute top-4 right-4 hidden md:block">
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 md:p-12">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {activeTab === "organization" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Organization Settings</h3>
                  <p className="text-gray-500 mt-1">Manage your company's global profile and branding.</p>
                </div>
                
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                    <input 
                      type="text" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Brand Color</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-20 rounded cursor-pointer border-0 p-0"
                      />
                      <span className="text-sm text-gray-500 font-mono">{primaryColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Timezone</label>
                    <select 
                      value={defaultTimezone}
                      onChange={(e) => setDefaultTimezone(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    >
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Central European Time (CET)</option>
                    </select>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                    <button 
                      onClick={saveOrganizationSettings}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {loading ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Users & Teams</h3>
                  <p className="text-gray-500 mt-1">Manage platform members, roles, and teams.</p>
                </div>
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
                  <Users className="w-12 h-12 text-gray-300 dark:text-slate-600 mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white">Team Management</h4>
                  <p className="text-sm text-gray-500 max-w-md mt-2">
                    Create functional teams (e.g., Cleaners, Management) to easily assign tasks and manage permissions.
                  </p>
                  <button className="mt-6 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    + Create Team
                  </button>
                </div>
              </div>
            )}

            {activeTab === "board" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Board Defaults</h3>
                  <p className="text-gray-500 mt-1">Configure global standard labels across all workspaces.</p>
                </div>
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Global Status Labels</h4>
                  <div className="space-y-3">
                    {globalStatusLabels.length > 0 ? globalStatusLabels.map(label => (
                      <div key={label.id} className="flex items-center gap-4">
                        <div className={`w-32 py-1 text-center text-white text-xs font-medium rounded ${label.color}`}>
                          {label.label}
                        </div>
                        <span className="text-sm text-gray-500">Available globally</span>
                      </div>
                    )) : (
                      <p className="text-sm text-gray-500">No global labels defined yet. Standard default labels will be used.</p>
                    )}
                  </div>
                  <button className="mt-6 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    + Add Global Label
                  </button>
                </div>
              </div>
            )}

            {activeTab === "integrations" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Integrations & API</h3>
                  <p className="text-gray-500 mt-1">Connect HostFlow with external tools via Webhooks and API keys.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 text-center flex flex-col items-center">
                    <Webhook className="w-10 h-10 text-blue-500 mb-4" />
                    <h4 className="text-md font-bold text-gray-900 dark:text-white">Webhooks</h4>
                    <p className="text-sm text-gray-500 mt-2 mb-6">Send real-time updates to external systems when tasks change.</p>
                    <button className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium rounded-lg text-sm mt-auto w-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                      Manage Webhooks
                    </button>
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 text-center flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-mono font-bold mb-4">
                      {`</>`}
                    </div>
                    <h4 className="text-md font-bold text-gray-900 dark:text-white">Developer API</h4>
                    <p className="text-sm text-gray-500 mt-2 mb-6">Generate API keys to programmatically manage boards and items.</p>
                    <button className="px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium rounded-lg text-sm mt-auto w-full hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors">
                      Generate API Key
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h3>
                  <p className="text-gray-500 mt-1">Control how and when you receive updates.</p>
                </div>
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
                   <div className="space-y-6">
                     <div className="flex items-center justify-between">
                       <div>
                         <h4 className="font-medium text-gray-900 dark:text-white">Email Notifications</h4>
                         <p className="text-sm text-gray-500">Receive emails when you are assigned a task or mentioned.</p>
                       </div>
                       <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
                     </div>
                     <div className="flex items-center justify-between">
                       <div>
                         <h4 className="font-medium text-gray-900 dark:text-white">Daily Digest</h4>
                         <p className="text-sm text-gray-500">Receive a morning summary of tasks due today.</p>
                       </div>
                       <input type="checkbox" className="w-5 h-5 text-blue-600 rounded" />
                     </div>
                     <div className="flex items-center justify-between">
                       <div>
                         <h4 className="font-medium text-gray-900 dark:text-white">In-App Alerts</h4>
                         <p className="text-sm text-gray-500">Show notification dot and toast alerts while using the app.</p>
                       </div>
                       <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
                     </div>
                   </div>
                </div>
              </div>
            )}

            {activeTab === "readability" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                    Readability & Typography
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Select your preferred font family to optimize reading legibility and interface aesthetics.
                  </p>
                </div>
                <ReadabilityTabContent />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

function ReadabilityTabContent() {
  const { currentFont, setFont, fontOptions } = useFont();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fontOptions.map((option) => {
          const isSelected = currentFont === option.id;
          return (
            <div
              key={option.id}
              onClick={() => setFont(option.id)}
              className={`group relative rounded-xl border-2 p-5 cursor-pointer transition-all flex flex-col justify-between select-none ${
                isSelected
                  ? "border-blue-600 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-md ring-2 ring-blue-500/20"
                  : "border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/40 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                {option.badge ? (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {option.badge}
                  </span>
                ) : (
                  <span />
                )}

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                    <Check size={14} className="stroke-[3]" />
                  </div>
                )}
              </div>

              <div
                className="py-6 px-3 text-center rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700/60 my-2 min-h-[90px] flex items-center justify-center"
                style={{ fontFamily: option.cssValue }}
              >
                <p className="text-sm md:text-base text-gray-800 dark:text-gray-100 leading-relaxed font-normal">
                  {option.sampleText}
                </p>
              </div>

              <div className="mt-3 text-center">
                <p
                  className="text-base font-bold text-gray-900 dark:text-white"
                  style={{ fontFamily: option.cssValue }}
                >
                  {option.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                  {option.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

