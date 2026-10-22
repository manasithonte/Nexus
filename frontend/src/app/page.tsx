"use client";

import { useState } from "react";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedPackages, setSelectedPackages] = useState<Record<string, boolean>>({});
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<any>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;
    setLoading(true);
    setResult(null);
    setUpgradeResult(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, github_token: githubToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Error analyzing repository");
      }
      setResult(data);

      const initialSelected: Record<string, boolean> = {};
      if (data.upgrade_plan) {
        data.upgrade_plan.forEach((item: any) => {
          initialSelected[item.dependency] = item.recommended;
        });
      }
      setSelectedPackages(initialSelected);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error analyzing repository");
    } finally {
      setLoading(false);
    }
  };

  const executeUpgrade = async () => {
    if (!result || !result.upgrade_plan || result.upgrade_plan.length === 0) return;

    const planToExecute = result.upgrade_plan.filter((item: any) => selectedPackages[item.dependency]);
    if (planToExecute.length === 0) {
      alert("Please select at least one package to upgrade.");
      return;
    }

    setUpgrading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: result.repo_url,
          plan: planToExecute,
          github_token: githubToken,
        }),
      });
      const data = await res.json();
      setUpgradeResult(data);
    } catch (err) {
      console.error(err);
      alert("Error upgrading repository");
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0A0F1C] font-sans text-slate-100 selection:bg-cyan-500/30">
      {/* Background glowing orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-6 py-16 space-y-16">
        {/* Header */}
        <header className="text-center space-y-6">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/50 backdrop-blur-md shadow-lg shadow-cyan-900/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="text-xs font-semibold tracking-wide uppercase bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">Nexus Engine v2.0 Online</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter">
            <span className="bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 bg-clip-text text-transparent drop-shadow-sm">Nexus</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 font-light max-w-2xl mx-auto leading-relaxed">
            The Agentic AI Code Upgrader. Automate repository analysis, dependency patching, and Pull Request generation in seconds.
          </p>
        </header>

        {/* Input Form */}
        <div className="relative group max-w-4xl mx-auto z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-500"></div>
          <div className="relative bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 p-8 md:p-10 rounded-3xl shadow-2xl">
            <form onSubmit={handleAnalyze} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-300">Target Repository</label>
                  <input
                    type="url"
                    required
                    placeholder="https://github.com/username/repo"
                    className="w-full px-5 py-4 rounded-xl bg-[#0d1425] border border-slate-700/80 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600 shadow-inner"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  <label className="flex justify-between items-center text-sm font-semibold text-slate-300">
                    <span>GitHub Token</span>
                    <span className="text-slate-500 font-normal text-xs uppercase tracking-wider bg-slate-800 px-2 py-0.5 rounded">Required for PRs</span>
                  </label>
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-5 py-4 rounded-xl bg-[#0d1425] border border-slate-700/80 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600 shadow-inner"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-lg tracking-wide rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Running AI Diagnostics...</span>
                  </>
                ) : (
                  <span>Initialize Pipeline</span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Results Section */}
        {result && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Top Stat Cards */}
            <div className="grid gap-6 md:grid-cols-3">
              <div className="bg-slate-900/60 backdrop-blur-lg border border-slate-700/50 p-8 rounded-3xl flex flex-col justify-center transition-all hover:border-slate-600 shadow-lg">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Packages Scanned</h3>
                <div className="flex items-baseline space-x-3">
                  <p className="text-6xl font-black text-white">{result.dependencies.length}</p>
                  <span className="text-slate-500 font-medium">total libraries</span>
                </div>
              </div>
              <div className="bg-slate-900/60 backdrop-blur-lg border border-slate-700/50 p-8 rounded-3xl flex flex-col justify-center transition-all hover:border-rose-500/30 shadow-lg group">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 group-hover:text-rose-400 transition-colors">Outdated Packages</h3>
                <div className="flex items-baseline space-x-3">
                  <p className="text-6xl font-black text-rose-400 drop-shadow-[0_0_15px_rgba(251,113,133,0.3)]">
                    {result.dependencies.filter((d: any) => d.is_outdated).length}
                  </p>
                  <span className="text-slate-500 font-medium pt-2">require attention</span>
                </div>
              </div>
              <div className="bg-slate-900/60 backdrop-blur-lg border border-slate-700/50 p-8 rounded-3xl flex flex-col justify-center transition-all hover:border-amber-500/30 shadow-lg group">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 group-hover:text-amber-400 transition-colors">Known Vulnerabilities</h3>
                <div className="flex items-baseline space-x-3">
                  <p className="text-6xl font-black text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                    {result.dependencies.reduce((total: number, d: any) => total + (d.vulnerabilities?.length || 0), 0)}
                  </p>
                  <span className="text-slate-500 font-medium pt-2">
                    in {result.dependencies.filter((d: any) => d.vulnerabilities?.length).length} packages
                  </span>
                </div>
              </div>
            </div>

            {/* AI Upgrade Plan */}
            {result.upgrade_plan && result.upgrade_plan.length > 0 && (
              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-8 md:p-10 rounded-3xl shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 pb-6 border-b border-slate-800">
                  <h3 className="text-3xl font-black text-white flex items-center gap-4">
                    <span className="bg-indigo-500/20 text-indigo-400 p-3 rounded-xl shadow-inner">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    </span>
                    AI Execution Plan
                  </h3>
                  <div className="flex items-center space-x-2 px-4 py-2 bg-[#0A0F1C] border border-slate-800 rounded-lg">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                    <span className="text-slate-400 text-sm font-semibold tracking-wide">Powered by Gemini 2.5 Flash</span>
                  </div>
                </div>

                <div className="space-y-6">
                  {result.upgrade_plan.map((item: any, idx: number) => {
                    const isSelected = selectedPackages[item.dependency] || false;
                    return (
                      <div key={idx} className={`relative group p-6 rounded-2xl border transition-all duration-300 ${isSelected ? 'bg-slate-800/80 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:border-cyan-400' : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/60 hover:border-slate-600'}`}>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                          <label className="flex items-center space-x-5 cursor-pointer flex-1">
                            <div className="relative flex items-center justify-center">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={isSelected}
                                onChange={(e) => setSelectedPackages(prev => ({ ...prev, [item.dependency]: e.target.checked }))}
                              />
                              <div className="w-7 h-7 rounded border-2 border-slate-600 peer-checked:border-cyan-500 peer-checked:bg-cyan-500 transition-all flex items-center justify-center bg-[#0A0F1C]">
                                <svg className={`w-5 h-5 text-white transition-transform duration-200 ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              </div>
                            </div>
                            <div>
                              <h4 className={`text-2xl font-bold transition-colors ${isSelected ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{item.dependency}</h4>
                              <div className="flex items-center text-sm font-mono mt-1 space-x-3">
                                <span className="text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{item.from_version}</span>
                                <span className="text-slate-600">→</span>
                                <span className="text-cyan-400 bg-cyan-400/10 px-2.5 py-0.5 rounded border border-cyan-400/20 font-semibold">{item.to_version}</span>
                              </div>
                            </div>
                          </label>
                          <div className="flex items-center gap-3">
                          {item.security_fix && (
                            <span className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400">
                              Security Fix
                            </span>
                          )}
                          <span className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl border ${item.risk_level === 'High' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(251,113,133,0.15)]' :
                            item.risk_level === 'Medium' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]' :
                              item.risk_level === 'None' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                                'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.15)]'
                            }`}>
                            {item.risk_level} Risk
                          </span>
                          </div>
                        </div>
                        {item.vulnerabilities?.length > 0 && (
                          <div className="mt-6 p-5 rounded-xl border bg-amber-500/5 border-amber-500/20">
                            <h5 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                              {item.vulnerabilities.length} Known {item.vulnerabilities.length === 1 ? 'Vulnerability' : 'Vulnerabilities'}
                            </h5>
                            <ul className="space-y-2">
                              {item.vulnerabilities.map((vuln: any) => (
                                <li key={vuln.id} className="text-sm text-slate-300 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                  <a href={vuln.url} target="_blank" rel="noopener noreferrer" className="font-mono text-amber-300 hover:text-amber-200 underline underline-offset-2">{vuln.id}</a>
                                  {vuln.severity && <span className="text-xs font-bold uppercase text-slate-400">{vuln.severity}</span>}
                                  <span className="opacity-90">{vuln.summary}</span>
                                  {vuln.fixed_in && <span className="text-xs text-emerald-400 font-mono">fixed in {vuln.fixed_in}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="grid md:grid-cols-2 gap-5 mt-6 border-t border-slate-800/50 pt-6">
                          <div className={`p-5 rounded-xl border transition-colors ${isSelected ? 'bg-[#0d1425]/80 border-cyan-900/30' : 'bg-slate-950/40 border-slate-800/50'}`}>
                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              AI Assessment
                            </h5>
                            <p className="text-sm text-slate-300 leading-relaxed opacity-90">{item.reasoning}</p>
                            <p className="text-xs text-slate-500 mt-3">
                              {item.notes_source
                                ? `Based on ${item.notes_source}`
                                : 'No release notes found, so this assessment is less reliable'}
                            </p>
                          </div>
                          <div className={`p-5 rounded-xl border transition-colors ${isSelected ? 'bg-[#0d1425]/80 border-cyan-900/30' : 'bg-slate-950/40 border-slate-800/50'}`}>
                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              Breaking Changes
                            </h5>
                            <p className="text-sm text-slate-300 leading-relaxed opacity-90">{item.breaking_changes}</p>
                            {item.affected_locations?.length > 0 && (
                              <div className="mt-4">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Affected Code</p>
                                <div className="flex flex-wrap gap-2">
                                  {item.affected_locations.map((loc: string) => (
                                    <code key={loc} className="text-xs font-mono text-cyan-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">{loc}</code>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Execute Button Content */}
                <div className="pt-10 mt-10 border-t border-slate-800">
                  {upgradeResult ? (
                    <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 animate-in zoom-in-95 duration-500">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <div>
                          <h4 className="text-xl text-emerald-400 font-bold mb-1">Execution Successful</h4>
                          <p className="text-slate-300 text-sm">{upgradeResult.message}</p>
                        </div>
                      </div>
                      {upgradeResult.pr_url && (
                        <a
                          href={upgradeResult.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-400 transition transform hover:-translate-y-0.5 whitespace-nowrap shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                        >
                          View Pull Request on GitHub
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={executeUpgrade}
                      disabled={upgrading}
                      className="w-full py-5 px-6 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-xl tracking-wide rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:transform-none disabled:shadow-none flex justify-center items-center gap-3 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
                      <span className="relative z-10 flex items-center gap-3">
                        {upgrading ? (
                          <>
                            <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Compiling Protocol & Opening PR...
                          </>
                        ) : (
                          <>
                            Deploy AI Upgrade Run
                            <svg className="w-6 h-6 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          </>
                        )}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {result.upgrade_plan && result.upgrade_plan.length === 0 && (
              <div className="p-10 bg-slate-900/60 backdrop-blur-lg border border-slate-800 rounded-3xl text-center shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                  <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h3 className="text-3xl font-black text-white mb-2">Systems Nominal</h3>
                  <p className="text-lg text-slate-400">All dependencies are up-to-date or no dependencies were found.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
