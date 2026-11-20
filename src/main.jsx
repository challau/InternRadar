import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Radar,
  Compass,
  Bookmark,
  Globe2,
  ArrowUpRight,
  Search,
  MapPin,
  ChevronDown,
  ArrowRight,
  RefreshCw,
  Check,
  CheckCircle2,
  Clock3,
  X,
  SlidersHorizontal,
  Building2,
  BriefcaseBusiness,
  ExternalLink,
  Info,
  Menu,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Palette,
  ChartNoAxesCombined,
  GraduationCap,
  Radio,
  MoveUpRight,
  Plus,
  Upload,
  Pencil,
  Trash2,
  Play,
  Activity,
  PauseCircle,
} from "lucide-react";
import "./styles.css";
import "./search.css";
const categories = ["Engineering", "AI & Data", "Design", "Business", "Other"];
const icons = {
  Engineering: Code2,
  "AI & Data": Database,
  Design: Palette,
  Business: ChartNoAxesCombined,
  Other: BriefcaseBusiness,
};
const PER_PAGE = 12;
function readSaved() {
  try {
    const values = JSON.parse(
      localStorage.getItem("internradar:saved") || "[]",
    );
    return Array.isArray(values)
      ? values.filter(
          (j) =>
            j &&
            typeof j.id === "string" &&
            typeof j.title === "string" &&
            /^https:\/\//.test(j.applyUrl),
        )
      : [];
  } catch {
    return [];
  }
}
function relative(iso) {
  if (!iso) return "Not yet checked";
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  return min < 1
    ? "just now"
    : min < 60
      ? `${min}m ago`
      : min < 1440
        ? `${Math.floor(min / 60)}h ago`
        : `${Math.floor(min / 1440)}d ago`;
}
function date(iso) {
  if (!iso || iso === "Not specified" || Number.isNaN(Date.parse(iso)))
    return "Not specified";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function CompanyLogo({ job }) {
  return (
    <span
      className={`company-logo ${job.sourceId}`}
      style={{ "--brand": job.color }}
      aria-hidden="true"
    >
      {job.sourceId === "figma" ? (
        <span className="figma-mark">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : job.sourceId === "databricks" ? (
        <span className="db-mark">
          ▱<br />▱<br />▱
        </span>
      ) : job.sourceId === "cloudflare" ? (
        <span className="cloud-mark">☁</span>
      ) : (
        job.company[0]
      )}
    </span>
  );
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];
  const keys = rows
    .shift()
    .map((key) => key.toLowerCase().replace(/[\s_-]+/g, ""));
  return rows
    .map((values) =>
      Object.fromEntries(keys.map((key, index) => [key, values[index] || ""])),
    )
    .map((item) => ({
      name: item.name,
      website: item.website || item.officialwebsite,
      careers: item.careers || item.careerportalurl || item.careersurl,
      country: item.country,
      industry: item.industry,
      ats: item.ats || item.atsprovider || "official",
      boardId: item.boardid || item.boardtoken,
      pollingMinutes: Number(item.pollingminutes || 60),
      enabled: item.enabled === "" ? true : !/^false|no|0$/i.test(item.enabled),
    }));
}
function CompanyManagement({
  companies,
  setCompanies,
  token,
  setToken,
  onRefresh,
}) {
  const empty = {
    name: "",
    website: "",
    careers: "",
    country: "",
    industry: "",
    ats: "greenhouse",
    boardId: "",
    pollingMinutes: 60,
    enabled: true,
  };
  const [form, setForm] = useState(null),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [apiToken, setApiToken] = useState(token || "");
  async function request(url, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
    };
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok)
      throw new Error(result?.error || `Request failed (${response.status}).`);
    return result;
  }
  async function loadCompanies() {
    const rows = await request("/api/companies");
    setCompanies(rows);
  }
  async function save(event) {
    event.preventDefault();
    setBusy("save");
    setMessage("");
    try {
      const item = await request(
        editing ? `/api/companies/${editing}` : "/api/companies",
        { method: editing ? "PUT" : "POST", body: JSON.stringify(form) },
      );
      setCompanies((old) =>
        editing
          ? old.map((row) => (row.id === item.id ? item : row))
          : [...old, item],
      );
      setForm(null);
      setEditing(null);
      setToken(apiToken);
      sessionStorage.setItem("internradar:admin-token", apiToken);
      setMessage(`${item.name} saved.`);
      await onRefresh();
      await loadCompanies();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }
  async function upload(file) {
    setBusy("upload");
    setMessage("");
    try {
      const list = parseCSV(await file.text());
      if (!list.length)
        throw new Error("The CSV is empty or has no company rows.");
      const result = await request("/api/companies/import", {
        method: "POST",
        body: JSON.stringify({ companies: list }),
      });
      await loadCompanies();
      setToken(apiToken);
      sessionStorage.setItem("internradar:admin-token", apiToken);
      setMessage(
        `${result.imported} companies imported${result.errors.length ? `; ${result.errors.length} rows skipped` : ""}.`,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }
  async function testConnection(company) {
    setBusy(company.id);
    setMessage("");
    try {
      const result = await request(`/api/companies/${company.id}/test`, {
        method: "POST",
      });
      setCompanies((old) =>
        old.map((row) =>
          row.id === company.id
            ? {
                ...row,
                connectionStatus: result.status,
                lastCheckedAt: result.lastCheckedAt,
                lastSuccessfulAt:
                  result.status === "connected"
                    ? result.lastCheckedAt
                    : row.lastSuccessfulAt,
                lastError: result.error || null,
              }
            : row,
        ),
      );
      setMessage(
        result.status === "connected"
          ? `Connection tested: ${result.count} qualifying openings found.`
          : result.error || "Connection not supported.",
      );
      await onRefresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }
  async function remove(company) {
    if (!window.confirm(`Remove ${company.name} and its tracked openings?`))
      return;
    try {
      await request(`/api/companies/${company.id}`, { method: "DELETE" });
      setCompanies((old) => old.filter((row) => row.id !== company.id));
      setMessage(`${company.name} removed.`);
      onRefresh();
    } catch (error) {
      setMessage(error.message);
    }
  }
  function edit(company) {
    setEditing(company.id);
    setForm({ ...company });
  }
  async function toggle(company) {
    try {
      const item = await request(`/api/companies/${company.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...company, enabled: !company.enabled }),
      });
      setCompanies((old) =>
        old.map((row) => (row.id === item.id ? item : row)),
      );
      setMessage(
        `${item.name} monitoring ${item.enabled ? "enabled" : "paused"}.`,
      );
    } catch (error) {
      setMessage(error.message);
    }
  }
  return (
    <section className="company-admin">
      <div className="page-heading">
        <span className="eyebrow">YOUR TARGET LIST</span>
        <h1>Company management.</h1>
        <p>
          Only companies you add here are monitored. Connection status is
          confirmed by a live feed test.
        </p>
      </div>
      <div className="admin-toolbar">
        <label className="token-field">
          Admin token{" "}
          <input
            type="password"
            value={apiToken}
            onChange={(event) => {
              setApiToken(event.target.value);
              setToken(event.target.value);
              sessionStorage.setItem(
                "internradar:admin-token",
                event.target.value,
              );
            }}
            placeholder="Only needed when ADMIN_TOKEN is configured"
          />
        </label>
        <button
          className="primary-button"
          onClick={() => {
            setEditing(null);
            setForm({ ...empty });
          }}
        >
          <Plus size={16} /> Add company
        </button>
        <label
          className={`secondary-button upload-button ${busy === "upload" ? "disabled" : ""}`}
        >
          <Upload size={15} />
          {busy === "upload" ? "Importing…" : "Import CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy === "upload"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="csv-hint">
        CSV columns: name, website, careers, country, industry, ats, boardId,
        pollingMinutes, enabled.
      </p>
      {message && (
        <div className="admin-message" role="status">
          {message}
        </div>
      )}
      {form && (
        <form className="company-form" onSubmit={save}>
          <div className="company-form-heading">
            <h2>{editing ? "Edit company" : "Add target company"}</h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setForm(null);
                setEditing(null);
              }}
              aria-label="Close form"
            >
              <X size={18} />
            </button>
          </div>
          <label>
            Company name
            <input
              required
              maxLength="120"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Official website
            <input
              required
              type="url"
              placeholder="https://company.com"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </label>
          <label>
            Career portal URL
            <input
              required
              type="url"
              placeholder="https://boards.greenhouse.io/company"
              value={form.careers}
              onChange={(e) => setForm({ ...form, careers: e.target.value })}
            />
          </label>
          <label>
            ATS provider
            <select
              value={form.ats}
              onChange={(e) => setForm({ ...form, ats: e.target.value })}
            >
              {[
                ["greenhouse", "Greenhouse"],
                ["lever", "Lever"],
                ["ashby", "Ashby"],
                ["smartrecruiters", "SmartRecruiters"],
                ["workday", "Workday (not yet supported)"],
                ["official", "Official portal (not yet supported)"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Board ID / token
            <input
              value={form.boardId || ""}
              onChange={(e) => setForm({ ...form, boardId: e.target.value })}
              placeholder="Auto-detected from common ATS career URLs"
            />
          </label>
          <label>
            Country
            <input
              value={form.country || ""}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="e.g. India"
            />
          </label>
          <label>
            Industry
            <input
              value={form.industry || ""}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              placeholder="e.g. Software"
            />
          </label>
          <label>
            Check interval (minutes)
            <input
              type="number"
              min="15"
              max="10080"
              value={form.pollingMinutes}
              onChange={(e) =>
                setForm({ ...form, pollingMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label className="monitor-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />{" "}
            Enable monitoring
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setForm(null);
                setEditing(null);
              }}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : "Save company"}
            </button>
          </div>
        </form>
      )}
      <div className="company-table">
        <div className="company-table-head">
          <span>Company</span>
          <span>Provider</span>
          <span>Monitoring</span>
          <span>Connection</span>
          <span>Last successful check</span>
          <span>Actions</span>
        </div>
        {!companies.length ? (
          <div className="empty-admin">
            <Building2 size={26} />
            <h3>Your target list is empty</h3>
            <p>
              Add a company or import your CSV to start monitoring official
              career feeds.
            </p>
          </div>
        ) : (
          companies.map((company) => (
            <article className="company-row" key={company.id}>
              <div className="company-row-name">
                <CompanyLogo
                  job={{
                    company: company.name,
                    sourceId: company.ats,
                    color: "#176d52",
                  }}
                />
                <div>
                  <strong>{company.name}</strong>
                  <a
                    href={company.careers}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {company.careers}
                  </a>
                </div>
              </div>
              <span className="provider-label">{company.ats}</span>
              <button
                className="monitor-status"
                onClick={() => toggle(company)}
                title="Toggle monitoring"
              >
                {company.enabled ? (
                  <>
                    <Radio size={14} /> Monitoring
                  </>
                ) : (
                  <>
                    <PauseCircle size={14} /> Paused
                  </>
                )}
              </button>
              <span
                className={`connection-status ${company.connectionStatus || "not_tested"}`}
              >
                {{
                  connected: "Connected",
                  failed: "Connection failed",
                  not_supported: "Not supported",
                  not_tested: "Not tested",
                }[company.connectionStatus] || "Not tested"}
              </span>
              <span className="last-sync">
                {relative(company.lastSuccessfulAt)}
              </span>
              <div className="company-actions">
                <button
                  aria-label={`Test ${company.name} connection`}
                  title="Test connection"
                  disabled={busy === company.id}
                  onClick={() => testConnection(company)}
                >
                  <Play size={15} />
                </button>
                <button
                  aria-label={`Edit ${company.name}`}
                  title="Edit"
                  onClick={() => edit(company)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Delete ${company.name}`}
                  title="Delete"
                  onClick={() => remove(company)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="coverage-note">
        <Info size={19} />
        <div>
          <strong>Connector coverage</strong>
          <p>
            Greenhouse, Lever, Ashby, and SmartRecruiters public feeds are
            tested when you choose “Test connection.” Workday and generic career
            portals are currently reported as unsupported; no scraping is
            attempted.
          </p>
        </div>
      </div>
    </section>
  );
}
const DIRECTORY_PAGE_SIZE = 50;
function CompanyDirectory() {
  const [items, setItems] = useState([]),
    [queryText, setQueryText] = useState(""),
    [query, setQuery] = useState(""),
    [countryText, setCountryText] = useState(""),
    [country, setCountry] = useState("");
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryText.trim());
      setCountry(countryText.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [queryText, countryText]);
  useEffect(() => {
    const controller = new AbortController();
    async function loadPage() {
      setLoading(true);
      setError("");
      const { supabase } = await import("./supabase.js");
      if (!supabase) {
        throw new Error("Company directory Supabase config is missing. Set the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values.");
      }
      if (controller.signal.aborted) return;
      let request = supabase
        .from("companies")
        .select(
          "id,name,website,country,monitoring_enabled,connection_status,created_at",
          { count: "exact" },
        )
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE - 1)
        .abortSignal(controller.signal);
      if (query)
        request = request.ilike(
          "name",
          `%${query.replace(/[\\%_]/g, "\\$&")}%`,
        );
      if (country.trim())
        request = request.ilike(
          "country",
          `%${country.trim().replace(/[\\%_]/g, "\\$&")}%`,
        );
      const { data, count: rowCount, error: requestError } = await request;
      if (controller.signal.aborted) return;
      if (requestError) {
        setError(requestError.message);
        setItems([]);
        setTotal(0);
      } else {
        setItems(data || []);
        setTotal(rowCount || 0);
      }
      setLoading(false);
    }
    loadPage().catch((cause) => {
      if (!controller.signal.aborted) {
        setError(cause.message || "Could not load the company directory.");
        setItems([]);
        setTotal(0);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [page, query, country, retry]);
  const pageCount = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  return (
    <section className="directory-page">
      <div className="page-heading">
        <span className="eyebrow">SUPABASE COMPANY DIRECTORY</span>
        <h1>Explore companies.</h1>
        <p>
          Search the full company directory. Browsing here does not enable
          monitoring or change company records.
        </p>
      </div>
      <div className="directory-toolbar">
        <label className="directory-search">
          <Search size={18} />
          <input
            aria-label="Search company names"
            placeholder="Search company names…"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
          />
          {queryText && (
            <button
              type="button"
              aria-label="Clear company search"
              onClick={() => setQueryText("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <label className="directory-country">
          <MapPin size={16} />
          <input
            aria-label="Filter by country"
            placeholder="Filter by country"
            value={countryText}
            onChange={(event) => setCountryText(event.target.value)}
          />
          {countryText && (
            <button
              type="button"
              aria-label="Clear country filter"
              onClick={() => setCountryText("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <span className="directory-total">
          {total.toLocaleString()} companies
        </span>
      </div>
      {error && (
        <div className="error-panel" role="alert">
          <WifiOff size={17} />
          <span>{error}</span>
          <button onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>
      )}
      <div className="directory-table-wrap">
        <table className="directory-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Country</th>
              <th>Monitoring</th>
              <th>Connection</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr key={`loading-${index}`} className="directory-skeleton">
                    <td colSpan="4">
                      <span />
                    </td>
                  </tr>
                ))
              : items.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <div className="directory-company">
                        <CompanyLogo
                          job={{
                            company: company.name || "?",
                            sourceId: "directory",
                            color: "#176d52",
                          }}
                        />
                        <div>
                          <strong>{company.name || "Unnamed company"}</strong>
                          {company.website &&
                            /^https:\/\//i.test(company.website) && (
                              <a
                                href={company.website}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {company.website}
                                <ArrowUpRight size={12} />
                              </a>
                            )}
                        </div>
                      </div>
                    </td>
                    <td>{company.country || "Not specified"}</td>
                    <td>
                      <span
                        className={`directory-monitor ${company.monitoring_enabled ? "enabled" : ""}`}
                      >
                        {company.monitoring_enabled
                          ? "Monitoring"
                          : "Not monitored"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`directory-connection ${String(company.connection_status || "not_tested").toLowerCase()}`}
                      >
                        {company.connection_status || "not_tested"}
                      </span>
                    </td>
                  </tr>
                ))}
            {!loading && !items.length && (
              <tr>
                <td colSpan="4">
                  <div className="directory-empty">
                    <Building2 size={26} />
                    <strong>
                      {error ? "Directory unavailable" : "No companies found"}
                    </strong>
                    <span>
                      {error
                        ? "Retry after checking your Supabase connection."
                        : "Try a different search or country filter."}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="directory-pagination">
        <span>
          {total
            ? `Showing ${(page - 1) * DIRECTORY_PAGE_SIZE + 1}–${Math.min(page * DIRECTORY_PAGE_SIZE, total)} of ${total.toLocaleString()}`
            : "No results"}{" "}
          · {DIRECTORY_PAGE_SIZE} per page
        </span>
        <div>
          <button
            className="secondary-button"
            disabled={loading || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={15} /> Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            className="secondary-button"
            disabled={loading || page >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <p className="directory-note">
        <Info size={14} /> Live read-only company records from Supabase. Only{" "}
        {DIRECTORY_PAGE_SIZE} rows are requested at a time; monitoring state is
        not changed here.
      </p>
    </section>
  );
}
function parseJobSearchLocation() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    type: params.get("type") || "",
    location: params.get("location") || "",
    workMode: params.get("work_mode") || "",
    experience: params.get("experience") || "",
    sort: params.get("sort") || "relevance",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
}
function isOfficialApplyURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password || url.port) return false;
    const path = url.pathname.split("/").filter(Boolean);
    const host = url.hostname.toLowerCase();
    if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
      return path.length >= 3 && path[1] === "jobs" && Boolean(path[2]);
    }
    return (
      (host === "jobs.lever.co" || host === "jobs.ashbyhq.com") &&
      path.length >= 2
    );
  } catch {
    return false;
  }
}
function jobTypeLabel(type) {
  return (
    {
      internship: "Internship",
      fresher: "Fresher",
      graduate: "Graduate",
      full_time: "Full-time",
      part_time: "Part-time",
    }[type] || "Opportunity"
  );
}
function JobCard({ job, saved, onSave, onView }) {
  const experience =
    job.experience_text ||
    (job.experience_min_years != null
      ? `${job.experience_min_years}${job.experience_max_years != null && job.experience_max_years !== job.experience_min_years ? `–${job.experience_max_years}` : ""} years`
      : "Not specified");
  const location =
    [job.city, job.state, job.country].filter(Boolean).join(", ") ||
    job.location_text ||
    "Location not specified";
  const applyUrl = job.application_url || job.applyUrl;
  const canApply = isOfficialApplyURL(applyUrl);
  return (
    <article className="search-job-card">
      <div className="search-job-main">
        <span className="search-company-mark" aria-hidden="true">
          {(job.company_name || job.company || "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="search-job-content">
          <div className="search-job-company">
            <strong>
              {job.company_name || job.company || "Company not specified"}
            </strong>
            <span className="verified-pill">
              <CheckCircle2 size={12} /> Verified listing
            </span>
            {job.change_status && (
              <span className={`job-update-pill ${job.change_status}`}>
                {job.change_status === "new" ? "New" : "Updated"}
              </span>
            )}
          </div>
          <button className="search-job-title" onClick={() => onView(job)}>
            {job.title}
          </button>
          <p className="search-job-location">
            <MapPin size={14} />
            {location}
          </p>
          <div className="search-job-tags">
            <span>{jobTypeLabel(job.job_type || job.opportunityType)}</span>
            {job.employment_type && (
              <span>{job.employment_type === "part_time" ? "Part-time" : "Full-time"}</span>
            )}
            {job.work_mode && job.work_mode !== "unknown" && (
              <span>{job.work_mode}</span>
            )}
            {job.experience_min_years != null || job.experience_text ? (
              <span>{experience}</span>
            ) : null}
            {job.graduation_year && <span>Class of {job.graduation_year}</span>}
            {job.internship_duration && <span>{job.internship_duration}</span>}
          </div>
          {job.eligibility_text && (
            <p className="search-job-eligibility">{job.eligibility_text}</p>
          )}
          <div className="search-job-meta">
            {job.salary_text && <span>{job.salary_text}</span>}
            {job.posted_at && <span>Posted {date(job.posted_at)}</span>}
            {job.application_deadline && (
              <span>Apply by {date(job.application_deadline)}</span>
            )}
            <span>
              Verified {relative(job.last_verified_at || job.lastCheckedAt)}
            </span>
          </div>
        </div>
      </div>
      <div className="search-job-actions">
        <button
          className={`save-job-button ${saved ? "saved" : ""}`}
          aria-pressed={saved}
          onClick={() => onSave(job)}
        >
          <Bookmark size={16} />
          {saved ? "Saved" : "Save"}
        </button>
        {canApply ? (
          <a
            className="official-apply-button"
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apply on official careers <ArrowUpRight size={15} />
          </a>
        ) : (
          <button
            className="official-apply-button disabled"
            disabled
            title="This posting does not contain a verified job-specific application link"
          >
            Apply link unavailable
          </button>
        )}
      </div>
    </article>
  );
}
function JobSearchPage({ saved, setSaved }) {
  const initial = parseJobSearchLocation();
  const [queryText, setQueryText] = useState(initial.q),
    [query, setQuery] = useState(initial.q);
  const [jobType, setJobType] = useState(initial.type),
    [location, setLocation] = useState(initial.location),
    [workMode, setWorkMode] = useState(initial.workMode),
    [experience, setExperience] = useState(initial.experience),
    [sort, setSort] = useState(initial.sort),
    [page, setPage] = useState(initial.page);
  const [items, setItems] = useState([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refreshTick, setRefreshTick] = useState(0);
  const lastQueryKey = useRef(null);
  const [activeJob, setActiveJob] = useState(null),
    [mobileFilters, setMobileFilters] = useState(false);
  const dialogRef = useRef(null);
  const savedIds = new Set(saved.map((job) => String(job.id)));
  const pageSize = 25,
    pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queryText.trim() !== query) {
        setQuery(queryText.trim());
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [queryText, query]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (jobType) params.set("type", jobType);
    if (location) params.set("location", location);
    if (workMode) params.set("work_mode", workMode);
    if (experience) params.set("experience", experience);
    if (sort !== "relevance") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }, [query, jobType, location, workMode, experience, sort, page]);
  useEffect(() => {
    const queryKey = JSON.stringify([
      query,
      jobType,
      location,
      workMode,
      experience,
      sort,
      page,
    ]);
    if (lastQueryKey.current !== queryKey) setLoading(true);
    const controller = new AbortController();
    async function load() {
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        sort,
      });
      if (query) params.set("q", query);
      if (jobType) params.set("type", jobType);
      if (location === "India") params.set("country", "India");
      else if (location && location !== "Remote") params.set("city", location);
      const selectedMode = location === "Remote" ? "remote" : workMode;
      if (selectedMode) params.set("work_mode", selectedMode);
      if (experience) params.set("experience", experience);
      try {
        const response = await fetch(`/api/search/jobs?${params}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load verified jobs.");
        if (controller.signal.aborted) return;
        setItems(
          (result.items || []).map((job) => ({
            ...job,
            id: String(job.id),
            applyUrl: job.application_url,
          })),
        );
        setTotal(Number(result.total) || 0);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause.message || "Could not load verified jobs.");
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) {
          lastQueryKey.current = queryKey;
          setLoading(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [query, jobType, location, workMode, experience, sort, page, refreshTick]);
  useEffect(() => {
    if (error) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshTick((value) => value + 1);
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [error]);
  useEffect(() => {
    function onPopState() {
      const filters = parseJobSearchLocation();
      setQueryText(filters.q);
      setQuery(filters.q);
      setJobType(filters.type);
      setLocation(filters.location);
      setWorkMode(filters.workMode);
      setExperience(filters.experience);
      setSort(filters.sort);
      setPage(filters.page);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (activeJob && dialog && !dialog.open) dialog.showModal();
    if (!activeJob && dialog?.open) dialog.close();
  }, [activeJob]);
  function updateFilter(setter, value) {
    setter(value);
    setPage(1);
  }
  function toggleSaved(job) {
    const id = String(job.id);
    setSaved((current) =>
      current.some((item) => String(item.id) === id)
        ? current.filter((item) => String(item.id) !== id)
        : [
            { ...job, id, applyUrl: job.application_url || job.applyUrl },
            ...current,
          ],
    );
  }
  return (
    <section className="job-search-page">
      <div className="search-hero">
        <span className="search-eyebrow">VERIFIED COMPANY CAREERS</span>
        <h1>
          Find your next internship
          <br className="desktop-search-break" /> or fresher job.
        </h1>
        <p>
          Search verified opportunities from company career pages across India.
        </p>
        <form
          className="main-job-search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(queryText.trim());
            setPage(1);
          }}
        >
          <Search size={20} />
          <input
            aria-label="Search roles, skills or companies"
            placeholder="Search roles, skills or companies..."
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
          />
          <button type="submit">
            Search <ArrowRight size={16} />
          </button>
        </form>
        <div className="quick-job-filters">
          <span>Quick filters</span>
          <button onClick={() => updateFilter(setJobType, "internship")}>
            Internships
          </button>
          <button onClick={() => updateFilter(setJobType, "fresher")}>
            Freshers
          </button>
          <button onClick={() => updateFilter(setLocation, "Remote")}>
            Remote
          </button>
          <button onClick={() => updateFilter(setLocation, "India")}>
            India
          </button>
        </div>
      </div>
      <div className="search-results-toolbar">
        <div>
          <h2>
            Latest verified openings <span>{total.toLocaleString()}</span>
          </h2>
          <p>
            Only recently verified listings with job-specific official
            application links.
          </p>
        </div>
        <div className="search-sort">
          <label htmlFor="job-sort">Sort</label>
          <select
            id="job-sort"
            value={sort}
            onChange={(event) => updateFilter(setSort, event.target.value)}
          >
            <option value="relevance">Most relevant</option>
            <option value="newest">Newly posted</option>
            <option value="verified">Recently verified</option>
          </select>
        </div>
      </div>
      <button
        className="mobile-filter-toggle"
        onClick={() => setMobileFilters((open) => !open)}
        aria-expanded={mobileFilters}
      >
        <SlidersHorizontal size={15} />
        {mobileFilters ? "Hide filters" : "Filters"}
      </button>
      <div
        className={`job-filter-toolbar ${mobileFilters ? "filter-toolbar-open" : ""}`}
      >
        <label>
          Job type
          <select
            value={jobType}
            onChange={(event) => updateFilter(setJobType, event.target.value)}
          >
            <option value="">All job types</option>
            <option value="internship">Internship</option>
            <option value="fresher">Fresher</option>
            <option value="graduate">Graduate</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
          </select>
        </label>
        <label>
          Experience
          <select
            value={experience}
            onChange={(event) =>
              updateFilter(setExperience, event.target.value)
            }
          >
            <option value="">Any experience</option>
            <option value="0">0 years</option>
            <option value="0-1">0–1 years</option>
            <option value="0-2">0–2 years</option>
          </select>
        </label>
        <label>
          Location
          <select
            value={location}
            onChange={(event) => updateFilter(setLocation, event.target.value)}
          >
            <option value="">All locations</option>
            {[
              "Bengaluru",
              "Hyderabad",
              "Pune",
              "Chennai",
              "Mumbai",
              "Delhi NCR",
              "India",
              "Remote",
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Work mode
          <select
            value={workMode}
            onChange={(event) => updateFilter(setWorkMode, event.target.value)}
          >
            <option value="">Any work mode</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
        {(jobType || location || workMode || experience) && (
          <button
            className="clear-job-filters"
            onClick={() => {
              setJobType("");
              setLocation("");
              setWorkMode("");
              setExperience("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {error && (
        <div className="job-search-error" role="alert">
          <WifiOff size={17} />
          <div>
            <strong>Verified job search unavailable</strong>
            <p>{error}</p>
          </div>
          <button
            className="job-search-retry"
            onClick={() => {
              setError("");
              setRefreshTick((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      <div className="search-job-list" aria-live="polite">
        {loading ? (
          Array.from({ length: 5 }, (_, index) => (
            <div className="search-job-skeleton" key={index}>
              <span />
              <i />
              <i />
              <i />
            </div>
          ))
        ) : items.length ? (
          items.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              saved={savedIds.has(job.id)}
              onSave={toggleSaved}
              onView={setActiveJob}
            />
          ))
        ) : !error ? (
          <div className="job-search-empty">
            <Search size={24} />
            <h3>No verified openings yet</h3>
            <p>
              Company records are not vacancy records. This search will show a
              role only after an official source is verified and its feed
              confirms the opening.
            </p>
          </div>
        ) : null}
      </div>
      {total > pageSize && (
        <div className="search-pagination">
          <span>
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total.toLocaleString()}
          </span>
          <div>
            <button
              disabled={loading || page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span>
              Page {page} of {pageCount}
            </span>
            <button
              disabled={loading || page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="search-job-dialog"
        onClose={() => setActiveJob(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setActiveJob(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setActiveJob(null);
        }}
      >
        {activeJob && (
          <div className="search-job-dialog-inner">
            <button
              className="search-dialog-close"
              onClick={() => setActiveJob(null)}
              aria-label="Close job details"
            >
              <X size={20} />
            </button>
            <span className="verified-pill">
              <CheckCircle2 size={13} /> Verified listing
            </span>
            <h2>{activeJob.title}</h2>
            <p className="dialog-company-name">{activeJob.company_name}</p>
            <p>
              {[activeJob.city, activeJob.state, activeJob.country]
                .filter(Boolean)
                .join(", ") ||
                activeJob.location_text ||
                "Location not specified"}
            </p>
            <dl>
              <div>
                <dt>Job type</dt>
                <dd>{jobTypeLabel(activeJob.job_type)}</dd>
              </div>
              <div>
                <dt>Experience</dt>
                <dd>{activeJob.experience_text || "Not specified"}</dd>
              </div>
              <div>
                <dt>Salary</dt>
                <dd>{activeJob.salary_text || "Not specified"}</dd>
              </div>
              <div>
                <dt>Eligibility</dt>
                <dd>{activeJob.eligibility_text || "Not specified"}</dd>
              </div>
              <div>
                <dt>Graduation year</dt>
                <dd>{activeJob.graduation_year || "Not specified"}</dd>
              </div>
              <div>
                <dt>Internship duration</dt>
                <dd>{activeJob.internship_duration || "Not specified"}</dd>
              </div>
              <div>
                <dt>Application deadline</dt>
                <dd>{date(activeJob.application_deadline)}</dd>
              </div>
              <div>
                <dt>Posted</dt>
                <dd>{date(activeJob.posted_at)}</dd>
              </div>
              <div>
                <dt>Last verified</dt>
                <dd>{relative(activeJob.last_verified_at)}</dd>
              </div>
            </dl>
            {activeJob.description && (
              <div className="search-job-description">
                <h3>Job description</h3>
                <p>{activeJob.description}</p>
              </div>
            )}
            {isOfficialApplyURL(activeJob.application_url) ? (
              <a
                className="official-apply-button"
                href={activeJob.application_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Apply on official careers <ArrowUpRight size={15} />
              </a>
            ) : (
              <p className="no-apply-link">
                Official job-specific application link unavailable.
              </p>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
function VerifiedSourceManager({ token, setToken }) {
  const [apiToken, setApiToken] = useState(token || "");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyMatches, setCompanyMatches] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({
    provider: "greenhouse",
    boardId: "",
    careerUrl: "",
    pollIntervalMinutes: 360,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
        ...options.headers,
      },
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
    return result;
  }
  async function loadSources() {
    setLoading(true);
    setError("");
    try {
      setSources(await request("/api/verified-sources"));
    } catch (cause) {
      setError(cause.message || "Could not load career sources.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadSources();
  }, []);
  async function searchCompanies() {
    setError("");
    setCompanyMatches([]);
    if (companyQuery.trim().length < 2) {
      setError("Enter at least two characters to find a Supabase company.");
      return;
    }
    try {
      const { supabase } = await import("./supabase.js");
      if (!supabase) {
        throw new Error("Company directory Supabase config is missing. Set the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values.");
      }
      const safeQuery = companyQuery.trim().replace(/[\\%_]/g, "\\$&");
      const { data, error: searchError } = await supabase
        .from("companies")
        .select("id,name")
        .ilike("name", `%${safeQuery}%`)
        .order("name")
        .limit(10);
      if (searchError) throw searchError;
      setCompanyMatches(data || []);
    } catch (cause) {
      setError(cause.message || "Could not search the Supabase company directory.");
    }
  }
  async function addSource(event) {
    event.preventDefault();
    if (!selectedCompany) {
      setError("Find and select a company from the Supabase directory first.");
      return;
    }
    setBusy("add");
    setError("");
    setMessage("");
    try {
      const result = await request("/api/verified-sources", {
        method: "POST",
        body: JSON.stringify({ ...form, companyId: selectedCompany.id }),
      });
      setMessage(`Source verified. ${result.result.active} qualifying listings found; monitoring remains disabled.`);
      setForm({ ...form, boardId: "", careerUrl: "" });
      setSelectedCompany(null);
      setCompanyQuery("");
      setToken(apiToken);
      sessionStorage.setItem("internradar:admin-token", apiToken);
      await loadSources();
    } catch (cause) {
      setError(cause.message || "Could not verify the career source.");
      setToken(apiToken);
      sessionStorage.setItem("internradar:admin-token", apiToken);
      await loadSources();
    } finally {
      setBusy("");
    }
  }
  async function toggleMonitoring(source) {
    setBusy(`toggle-${source.id}`);
    setError("");
    try {
      await request(`/api/verified-sources/${source.id}/monitoring`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !source.monitoring_enabled }),
      });
      await loadSources();
    } catch (cause) {
      setError(cause.message || "Could not update monitoring state.");
    } finally {
      setBusy("");
    }
  }
  async function testSource(source) {
    setBusy(`test-${source.id}`);
    setError("");
    setMessage("");
    try {
      const result = await request(`/api/verified-sources/${source.id}/test`, {
        method: "POST",
      });
      setMessage(`Connection tested: ${result.active} qualifying listings found.`);
      await loadSources();
    } catch (cause) {
      setError(cause.message || "Career source test failed.");
      await loadSources();
    } finally {
      setBusy("");
    }
  }
  async function removeSource(source) {
    if (!window.confirm(`Remove the verified feed for ${source.company_name}? Existing listings from this feed will also be removed.`)) return;
    setBusy(`delete-${source.id}`);
    setError("");
    try {
      await request(`/api/verified-sources/${source.id}`, { method: "DELETE" });
      setSources((current) => current.filter((item) => item.id !== source.id));
    } catch (cause) {
      setError(cause.message || "Could not remove the career source.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="verified-source-manager">
      <div className="source-manager-heading">
        <div>
          <h2>Verified career feeds</h2>
          <p>Only configured official Greenhouse, Lever, and Ashby boards are checked. Monitoring is always opt-in.</p>
        </div>
        <button className="secondary-button" onClick={loadSources} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>
      <label className="source-token-field">
        Admin token
        <input
          type="password"
          value={apiToken}
          autoComplete="current-password"
          onChange={(event) => setApiToken(event.target.value)}
          onBlur={() => {
            setToken(apiToken);
            sessionStorage.setItem("internradar:admin-token", apiToken);
          }}
        />
      </label>
      {message && <div className="admin-message" role="status">{message}</div>}
      {error && <div className="error-panel" role="alert"><WifiOff size={17} />{error}</div>}
      <form className="verified-source-form" onSubmit={addSource}>
        <h3>Add and test an official ATS source</h3>
        <label className="company-source-search">
          Supabase company
          <div className="company-source-search-control">
            <input
              value={companyQuery}
              onChange={(event) => {
                setCompanyQuery(event.target.value);
                setSelectedCompany(null);
              }}
              placeholder="Search company directory"
            />
            <button type="button" className="secondary-button" onClick={searchCompanies}>
              Find company
            </button>
          </div>
          {selectedCompany && <span className="selected-company"><CheckCircle2 size={14} /> {selectedCompany.name} · ID {selectedCompany.id}</span>}
          {companyMatches.length > 0 && (
            <div className="company-source-matches">
              {companyMatches.map((company) => (
                <button type="button" key={company.id} onClick={() => {
                  setSelectedCompany(company);
                  setCompanyQuery(company.name);
                  setCompanyMatches([]);
                }}>
                  {company.name}<span>ID {company.id}</span>
                </button>
              ))}
            </div>
          )}
        </label>
        <label>
          ATS provider
          <select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
        </label>
        <label>
          Board ID
          <input required value={form.boardId} onChange={(event) => setForm({ ...form, boardId: event.target.value })} placeholder="Company board identifier" />
        </label>
        <label className="source-career-url">
          Official career-board URL
          <input required type="url" value={form.careerUrl} onChange={(event) => setForm({ ...form, careerUrl: event.target.value })} placeholder="https://boards.greenhouse.io/company" />
        </label>
        <label>
          Poll interval
          <select value={form.pollIntervalMinutes} onChange={(event) => setForm({ ...form, pollIntervalMinutes: Number(event.target.value) })}>
            <option value={60}>Every hour</option>
            <option value={180}>Every 3 hours</option>
            <option value={360}>Every 6 hours</option>
            <option value={720}>Every 12 hours</option>
            <option value={1440}>Daily</option>
          </select>
        </label>
        <button className="primary-button source-add-button" disabled={busy === "add"}>
          {busy === "add" ? "Testing source…" : "Test and save source"} <ArrowRight size={15} />
        </button>
        <p className="source-form-note">A successful test verifies the feed but does not enable scheduled monitoring.</p>
      </form>
      {loading ? (
        <div className="source-status-list"><div className="source-status-skeleton" /><div className="source-status-skeleton" /></div>
      ) : sources.length ? (
        <div className="source-status-list">
          {sources.map((source) => (
            <article className="verified-source-row" key={source.id}>
              <div className="source-status-company">
                <span className="search-company-mark" aria-hidden="true">{(source.company_name || "?").slice(0, 1).toUpperCase()}</span>
                <div><strong>{source.company_name}</strong><span>{source.provider} · {source.board_id}</span></div>
              </div>
              <span className={`connection-status ${source.connection_status}`}>{source.connection_status}</span>
              <span className={`directory-monitor ${source.monitoring_enabled ? "enabled" : ""}`}>{source.monitoring_enabled ? "Monitoring" : "Monitoring off"}</span>
              <span className="last-sync">Last checked {relative(source.last_checked_at)}</span>
              {source.last_error && <p className="source-error">{source.last_error}</p>}
              <div className="verified-source-actions">
                <button className="secondary-button" disabled={busy === `test-${source.id}`} onClick={() => testSource(source)}>
                  <Play size={13} /> Test
                </button>
                <button className="secondary-button" disabled={!source.is_verified || busy === `toggle-${source.id}`} onClick={() => toggleMonitoring(source)}>
                  {source.monitoring_enabled ? "Pause" : "Enable"}
                </button>
                <button className="source-delete-button" disabled={busy === `delete-${source.id}`} onClick={() => removeSource(source)} aria-label={`Remove ${source.company_name} feed`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="job-search-empty">
          <Radio size={22} />
          <h3>No verified feeds configured</h3>
          <p>Adding a company to the directory does not create or enable a career feed.</p>
        </div>
      )}
    </div>
  );
}
function SearchPlatform() {
  const [tab, setTab] = useState("find"),
    [companyView, setCompanyView] = useState("directory");
  const [companies, setCompanies] = useState([]),
    [adminToken, setAdminToken] = useState(
      () => sessionStorage.getItem("internradar:admin-token") || "",
    );
  const [saved, setSaved] = useState(readSaved),
    [activity, setActivity] = useState([]),
    [activityError, setActivityError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/companies", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then(setCompanies)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("internradar:saved", JSON.stringify(saved));
    } catch {}
  }, [saved]);
  useEffect(() => {
    if (tab !== "companies" || companyView !== "activity") return;
    const controller = new AbortController();
    async function loadActivity() {
      setActivityError("");
      try {
        const headers = adminToken
          ? { Authorization: `Bearer ${adminToken}` }
          : {};
        const [legacyResponse, verifiedResponse] = await Promise.all([
          fetch("/api/activity", { signal: controller.signal }),
          adminToken
            ? fetch("/api/verified-activity", { headers, signal: controller.signal })
            : Promise.resolve(null),
        ]);
        if (!legacyResponse.ok) throw new Error("Could not load monitoring activity.");
        if (verifiedResponse && !verifiedResponse.ok) {
          throw new Error("Could not load verified-feed activity. Check the migration and admin configuration.");
        }
        const legacy = await legacyResponse.json();
        const verified = verifiedResponse
          ? (await verifiedResponse.json()).map((item) => ({
              id: `verified-${item.id}`,
              type: item.event_type,
              company: item.message.split(":")[0] || "Verified source",
              details: item.message,
              at: item.created_at,
            }))
          : [];
        setActivity(
          [...legacy, ...verified]
            .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
            .slice(0, 100),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setActivityError(error.message);
          setActivity([]);
        }
      }
    }
    loadActivity();
    return () => controller.abort();
  }, [tab, companyView, adminToken]);
  function showPage(next) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="search-platform">
      <header className="search-site-header">
        <a
          className="search-site-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            showPage("find");
          }}
        >
          <span className="search-site-mark">IR</span>
          <span>InternRadar</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={tab === "find" ? "selected" : ""}
            onClick={() => showPage("find")}
          >
            Find Jobs
          </button>
          <button
            className={tab === "companies" ? "selected" : ""}
            onClick={() => showPage("companies")}
          >
            Companies
          </button>
          <button
            className={tab === "saved" ? "selected" : ""}
            onClick={() => showPage("saved")}
          >
            Saved Jobs <span>{saved.length}</span>
          </button>
        </nav>
      </header>
      <main className="search-site-main">
        {tab === "find" && <JobSearchPage saved={saved} setSaved={setSaved} />}
        {tab === "saved" && (
          <section className="saved-jobs-page">
            <div className="page-heading">
              <span className="eyebrow">YOUR SHORTLIST</span>
              <h1>Saved jobs</h1>
              <p>
                Saved on this browser. Applications always open on the official
                careers site.
              </p>
            </div>
            {saved.length ? (
              <div className="search-job-list">
                {saved.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    saved
                    onSave={(item) =>
                      setSaved((current) =>
                        current.filter(
                          (savedJob) => String(savedJob.id) !== String(item.id),
                        ),
                      )
                    }
                    onView={() => {}}
                  />
                ))}
              </div>
            ) : (
              <div className="job-search-empty">
                <Bookmark size={24} />
                <h3>No saved jobs yet</h3>
                <p>Save a verified opening to keep it here.</p>
                <button
                  className="official-apply-button"
                  onClick={() => showPage("find")}
                >
                  Find jobs <ArrowRight size={15} />
                </button>
              </div>
            )}
          </section>
        )}
        {tab === "companies" && (
          <section className="companies-page">
            <div className="page-heading">
              <span className="eyebrow">COMPANY DIRECTORY</span>
              <h1>Companies</h1>
              <p>
                Browse the existing Supabase directory. Company records are not
                job openings and browsing never enables monitoring.
              </p>
            </div>
            <div
              className="company-subnav"
              role="tablist"
              aria-label="Company views"
            >
              {[
                ["directory", "Directory"],
                ["targets", "Monitoring targets"],
                ["sources", "Feed status"],
                ["activity", "Activity"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={companyView === value}
                  className={companyView === value ? "selected" : ""}
                  onClick={() => setCompanyView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {companyView === "directory" && <CompanyDirectory />}
            {companyView === "targets" && (
              <CompanyManagement
                companies={companies}
                setCompanies={setCompanies}
                token={adminToken}
                setToken={setAdminToken}
                onRefresh={async () => {}}
              />
            )}
            {companyView === "sources" && (
              <VerifiedSourceManager token={adminToken} setToken={setAdminToken} />
            )}
            {companyView === "activity" && (
              <div className="activity-list">
                {activityError ? (
                  <div className="error-panel" role="alert">
                    <WifiOff size={17} />
                    <span>{activityError}</span>
                  </div>
                ) : activity.length ? (
                  activity.map((item) => (
                    <article key={item.id}>
                      <span className={`activity-kind ${item.type}`}>
                        {item.type}
                      </span>
                      <div>
                        <strong>{item.company}</strong>
                        <p>{item.details}</p>
                        <small>
                          {date(item.at)} · {relative(item.at)}
                        </small>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="job-search-empty">
                    <Activity size={22} />
                    <h3>No monitoring activity</h3>
                    <p>
                      There are no verified feeds enabled for monitoring yet.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="search-site-footer">
        <span>InternRadar</span>
        <span>
          Verified source listings only · Applications stay with employers
        </span>
      </footer>
    </div>
  );
}
function App() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [companies, setCompanies] = useState([]),
    [adminToken, setAdminToken] = useState(
      () => sessionStorage.getItem("internradar:admin-token") || "",
    );
  const [tab, setTab] = useState("discover"),
    [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [country, setCountry] = useState(""),
    [selected, setSelected] = useState([]),
    [workplace, setWorkplace] = useState(""),
    [sort, setSort] = useState("updated"),
    [page, setPage] = useState(1);
  const [saved, setSaved] = useState(readSaved),
    [active, setActive] = useState(null),
    [detail, setDetail] = useState(null),
    [detailError, setDetailError] = useState(""),
    [guide, setGuide] = useState(false),
    [mobileFilters, setMobileFilters] = useState(false),
    [toast, setToast] = useState("");
  const detailRef = useRef(null),
    guideRef = useRef(null),
    requestRef = useRef(false);
  async function load() {
    if (requestRef.current) return;
    requestRef.current = true;
    if (!data) setLoading(true);
    try {
      const response = await fetch("/api/search/jobs?limit=50&sort=verified");
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!Array.isArray(result.items)) throw new Error();
      setData({
        ...result,
        jobs: result.items.map((job) => ({
          ...job,
          company: job.company_name,
          sourceId: String(job.source_id),
          sourceJobId: String(job.external_job_id),
          applyUrl: job.application_url,
          postedAt: job.posted_at,
          updatedAt: job.last_verified_at,
          lastCheckedAt: job.last_verified_at,
          opportunityType: job.job_type === "internship" ? "Internship" : "Fresher Job",
          workplace: job.work_mode,
          location: job.location_text || "Not specified",
          status: "active",
        })),
      });
      setError("");
    } catch {
      setError("We couldn’t reach the company feeds. Please try again.");
    } finally {
      setLoading(false);
      requestRef.current = false;
    }
  }
  useEffect(() => {
    load();
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCompanies)
      .catch(() => {});
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("internradar:saved", JSON.stringify(saved));
    } catch {
      setToast("Your browser could not save bookmarks.");
    }
  }, [saved]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setPage(1);
  }, [query, country, selected, workplace, sort, tab]);
  useEffect(() => {
    if (active && !detailRef.current.open) detailRef.current.showModal();
    if (!active && detailRef.current.open) detailRef.current.close();
  }, [active]);
  useEffect(() => {
    if (guide) guideRef.current.showModal();
    else if (guideRef.current.open) guideRef.current.close();
  }, [guide]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    fetch(`/api/jobs/${active.sourceId}/${active.sourceJobId}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setDetail)
      .catch((e) => {
        if (e.name !== "AbortError")
          setDetailError(
            "The full description is unavailable right now. You can still visit the official application page.",
          );
      });
    return () => controller.abort();
  }, [active?.id]);
  const jobs = data?.jobs || [];
  const savedIds = new Set(saved.map((j) => j.id));
  const currentJobs = new Map(jobs.map((j) => [j.id, j]));
  const baseJobs =
    tab === "saved"
      ? saved.map((j) => currentJobs.get(j.id) || { ...j, notInFeed: true })
      : jobs;
  const countries = [...new Set(jobs.flatMap((j) => j.countries || []))].sort();
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return baseJobs
      .filter(
        (j) =>
          (tab !== "discover" || j.opportunityType === "Internship") &&
          (tab !== "fresher" || j.opportunityType === "Fresher Job") &&
          terms.every((term) =>
            `${j.title} ${j.company} ${j.category}`
              .toLowerCase()
              .includes(term),
          ) &&
          (!country || (j.countries || [j.country]).includes(country)) &&
          (!selected.length || selected.includes(j.category)) &&
          (!workplace || j.workplace === workplace),
      )
      .sort((a, b) =>
        sort === "company"
          ? a.company.localeCompare(b.company)
          : Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0),
      );
  }, [data, saved, tab, query, country, selected, workplace, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );
  const healthy =
    data?.sources?.filter((s) => s.status === "healthy").length || 0;
  function toggleSaved(job) {
    const isSaved = savedIds.has(job.id);
    setSaved((old) =>
      isSaved ? old.filter((j) => j.id !== job.id) : [...old, job],
    );
    setToast(
      isSaved
        ? "Removed from saved internships"
        : "Saved for later — on this device",
    );
  }
  function toggleCategory(c) {
    setSelected((old) =>
      old.includes(c) ? old.filter((x) => x !== c) : [...old, c],
    );
  }
  function reset() {
    setQuery("");
    setDraft("");
    setCountry("");
    setSelected([]);
    setWorkplace("");
    setPage(1);
  }
  function nav(next) {
    setTab(next);
    reset();
    setMobileFilters(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("discover");
          }}
        >
          <span className="brand-symbol">
            <Radar size={25} />
          </span>
          Intern<span>Connect</span>
          <span className="brand-period">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={tab === "discover" ? "nav-item active" : "nav-item"}
            onClick={() => nav("discover")}
          >
            <Compass size={19} />
            <span className="nav-label-desktop">Discover internships</span>
            <span className="nav-label-mobile">Discover</span>
            <ArrowUpRight size={15} className="nav-arrow" />
          </button>
          <button
            className={tab === "fresher" ? "nav-item active" : "nav-item"}
            onClick={() => nav("fresher")}
          >
            <GraduationCap size={18} />
            <span className="nav-label-desktop">Fresher jobs</span>
            <span className="nav-label-mobile">Fresher jobs</span>
          </button>
          <button
            className={tab === "saved" ? "nav-item active" : "nav-item"}
            onClick={() => nav("saved")}
          >
            <Bookmark size={18} />
            <span className="nav-label-desktop">Saved internships</span>
            <span className="nav-label-mobile">Saved</span>
            <span className="nav-count">{saved.length}</span>
          </button>
          <button
            className={tab === "sources" ? "nav-item active" : "nav-item"}
            onClick={() => nav("sources")}
          >
            <Globe2 size={19} />
            <span className="nav-label-desktop">Company sources</span>
            <span className="nav-label-mobile">Sources</span>
          </button>
          <button
            className={tab === "directory" ? "nav-item active" : "nav-item"}
            onClick={() => nav("directory")}
          >
            <Building2 size={18} />
            <span className="nav-label-desktop">Company directory</span>
            <span className="nav-label-mobile">Directory</span>
          </button>
          <button
            className={tab === "companies" ? "nav-item active" : "nav-item"}
            onClick={() => nav("companies")}
          >
            <Building2 size={18} />
            <span className="nav-label-desktop">Manage companies</span>
            <span className="nav-label-mobile">Companies</span>
          </button>
          <button
            className={tab === "activity" ? "nav-item active" : "nav-item"}
            onClick={() => nav("activity")}
          >
            <Activity size={18} />
            <span className="nav-label-desktop">Monitoring activity</span>
            <span className="nav-label-mobile">Activity</span>
          </button>
        </nav>
        <div className="sidebar-callout">
          <span className="mini-orbit">
            <GraduationCap size={22} />
          </span>
          <h3>
            Small steps.
            <br />
            Big possibilities.
          </h3>
          <p>Your next chapter starts with putting yourself out there.</p>
          <button onClick={() => setGuide(true)}>
            How InternConnect works <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="green-dot" /> Built for your next chapter
          <div className="side-bottom-links">
            <button onClick={() => setGuide(true)}>About the data</button>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {
                {
                  discover: "Internships",
                  fresher: "Fresher jobs",
                  saved: "Saved internships",
                  sources: "Company sources",
                  directory: "Company directory",
                  companies: "Manage companies",
                  activity: "Monitoring activity",
                }[tab]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <span className="global-label">
              <Globe2 size={14} /> Global opportunities
            </span>
            <button
              className="avatar"
              onClick={() => setGuide(true)}
              aria-label="About InternConnect"
            >
              IC
            </button>
          </div>
        </header>
        <div className="main-content">
          {tab === "discover" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="green-dot" /> A LITTLE CURIOSITY. A WORLD
                    OF POSSIBILITY.
                  </div>
                  <h1>
                    Your next chapter
                    <br />
                    starts <span>here.</span>
                  </h1>
                  <p>
                    Discover internships from official company career pages.
                    <br className="desktop-break" /> Find your fit. Make your
                    move.
                  </p>
                  <div className="hero-trust">
                    <span className="trust-avatars">
                      <i>S</i>
                      <i>F</i>
                      <i>D</i>
                    </span>
                    <span>
                      Direct from the companies you’re curious about{" "}
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </div>
                <div className="radar-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <div className="radar-cross horizontal" />
                  <div className="radar-cross vertical" />
                  <div className="radar-sweep" />
                  <div className="orbit-core">
                    <MoveUpRight size={33} />
                  </div>
                  <span className="orbit-dot one" />
                  <span className="orbit-dot two" />
                  <span className="orbit-dot three" />
                  <div className="floating-tag tag-top">
                    <CheckCircle2 size={16} /> Your next opportunity
                  </div>
                  <div className="floating-tag tag-bottom">
                    <Globe2 size={16} /> A world to explore
                  </div>
                  <span className="art-caption">
                    GOOD THINGS ARE ON YOUR RADAR
                  </span>
                </div>
              </section>
              <section className="stats" aria-label="Opportunity summary">
                <div>
                  <span className="stat-icon">
                    <BriefcaseBusiness size={18} />
                  </span>
                  <div>
                    <strong>
                      {data
                        ? jobs.filter((j) => j.opportunityType === "Internship")
                            .length
                        : "—"}
                      <small> internships</small>
                    </strong>
                    <p>Active openings</p>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <GraduationCap size={18} />
                  </span>
                  <div>
                    <strong>
                      {data
                        ? jobs.filter(
                            (j) => j.opportunityType === "Fresher Job",
                          ).length
                        : "—"}
                      <small> fresher jobs</small>
                    </strong>
                    <p>Active openings</p>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <Building2 size={18} />
                  </span>
                  <div>
                    <strong>
                      {data ? healthy : "—"} / {companies.length}
                      <small> connected</small>
                    </strong>
                    <p>Target companies</p>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <RefreshCw size={18} />
                  </span>
                  <div>
                    <strong>
                      {data ? relative(data.checkedAt) : "Connecting…"}
                    </strong>
                    <p>Latest synchronization</p>
                  </div>
                </div>
              </section>
            </>
          )}
          {tab === "fresher" && (
            <section className="page-heading">
              <span className="eyebrow">YOUR NEXT FIRST STEP</span>
              <h1>Graduate & entry-level roles.</h1>
              <p>
                Only listings identified as junior, graduate, associate,
                trainee, or entry-level. Confirm eligibility with the employer.
              </p>
            </section>
          )}
          {tab === "saved" && (
            <section className="page-heading">
              <span className="eyebrow">KEEP YOUR OPTIONS OPEN</span>
              <h1>Your shortlist.</h1>
              <p>
                The opportunities you want to come back to. Saved on this
                browser.
              </p>
            </section>
          )}
          {tab === "directory" && <CompanyDirectory />}
          {tab === "companies" && (
            <CompanyManagement
              companies={companies}
              setCompanies={setCompanies}
              token={adminToken}
              setToken={setAdminToken}
              onRefresh={load}
            />
          )}
          {tab === "activity" && (
            <section className="activity-page">
              <div className="page-heading">
                <span className="eyebrow">LIVE MONITORING</span>
                <h1>Monitoring activity.</h1>
                <p>
                  Synchronization history and changes from your target
                  companies.
                </p>
              </div>
              {data?.activity?.length ? (
                <div className="activity-list">
                  {data.activity.map((item) => (
                    <article key={item.id}>
                      <span className={`activity-kind ${item.type}`}>
                        {item.type}
                      </span>
                      <div>
                        <strong>{item.company}</strong>
                        <p>{item.details || "Company monitoring updated"}</p>
                        <small>
                          {date(item.at)} · {relative(item.at)}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-admin">
                  <Activity size={26} />
                  <h3>No activity yet</h3>
                  <p>
                    Test or enable a supported company connection to begin
                    monitoring.
                  </p>
                </div>
              )}
            </section>
          )}
          {tab === "sources" ? (
            <>
              <section className="page-heading">
                <span className="eyebrow">STRAIGHT FROM THE SOURCE</span>
                <h1>
                  A clearer view of
                  <br />
                  what’s out there.
                </h1>
                <p>
                  Only companies on your target list appear here. Add a company
                  to build your own feed.
                </p>
              </section>
              <div className="source-heading">
                <h2>Connected career feeds</h2>
                <button
                  className="secondary-button"
                  disabled={loading}
                  onClick={load}
                >
                  <RefreshCw size={15} className={loading ? "spin" : ""} />{" "}
                  {loading ? "Checking…" : "Check feeds"}
                </button>
              </div>
              {error && (
                <div className="error-panel" role="alert">
                  {error}
                </div>
              )}
              <div className="sources-grid">
                {data?.sources?.map((s) => (
                  <article className="source-card" key={s.id}>
                    <div className="source-card-top">
                      <CompanyLogo
                        job={{ ...s, company: s.name, sourceId: s.id }}
                      />
                      <span
                        className={
                          s.status === "healthy"
                            ? "source-health"
                            : "source-health unavailable"
                        }
                      >
                        <span className="green-dot" />
                        {s.status === "healthy"
                          ? "Connected"
                          : s.connectionStatus === "not_supported"
                            ? "Not supported"
                            : s.connectionStatus === "failed"
                              ? "Connection failed"
                              : "Not tested"}
                      </span>
                    </div>
                    <h3>{s.name}</h3>
                    <p>
                      {companies.find((company) => company.id === s.id)?.ats ||
                        "Official"}{" "}
                      · Career feed
                    </p>
                    <div className="source-card-stats">
                      <strong>
                        {s.count}
                        <small> active openings</small>
                      </strong>
                      <span>Checked {relative(s.checkedAt)}</span>
                    </div>
                    {s.error && <p className="source-error">{s.error}</p>}
                    <a
                      href={s.careers}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visit company careers <ArrowUpRight size={16} />
                    </a>
                  </article>
                ))}
              </div>
              <div className="coverage-note">
                <Info size={19} />
                <div>
                  <strong>Worldwide locations. Transparent coverage.</strong>
                  <p>
                    Results come only from the company boards shown here. Remote
                    roles can still have country restrictions. Always confirm
                    eligibility and availability on the official listing.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {(tab === "discover" || tab === "fresher" || tab === "saved") && (
                <>
                  <section
                    className="search-section"
                    aria-label="Search opportunities"
                  >
                    <form
                      className="search-bar"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setQuery(draft);
                        setPage(1);
                      }}
                    >
                      <div className="search-field">
                        <Search size={21} />
                        <input
                          aria-label="Search by role or company"
                          placeholder={
                            tab === "fresher"
                              ? "Search fresher jobs or companies…"
                              : "What kind of internship are you looking for?"
                          }
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                        />
                        {draft && (
                          <button
                            type="button"
                            className="clear-search"
                            aria-label="Clear search"
                            onClick={() => {
                              setDraft("");
                              setQuery("");
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      <label className="location-field">
                        <MapPin size={18} />
                        <select
                          aria-label="Country"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        >
                          <option value="">Anywhere in the world</option>
                          {countries.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                      <button type="submit" className="search-button">
                        {tab === "fresher"
                          ? "Find fresher jobs"
                          : "Find internships"}{" "}
                        <ArrowRight size={17} />
                      </button>
                    </form>
                    <div className="quick-search">
                      <span>A place to start:</span>
                      {["Software", "Data", "Design", "Product"].map((term) => (
                        <button
                          key={term}
                          onClick={() => {
                            setDraft(term);
                            setQuery(term);
                          }}
                        >
                          {term}
                          <ArrowUpRight size={12} />
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="browse-layout">
                    <aside
                      className={`filters ${mobileFilters ? "filters-open" : ""}`}
                    >
                      <div className="filter-heading">
                        <h2>
                          <SlidersHorizontal size={16} /> Filters
                        </h2>
                        <button onClick={reset}>Reset</button>
                      </div>
                      <div className="filter-group">
                        <h3>YOUR FIELD</h3>
                        {categories.map((c) => (
                          <label className="checkbox-row" key={c}>
                            <input
                              type="checkbox"
                              checked={selected.includes(c)}
                              onChange={() => toggleCategory(c)}
                            />
                            <span>{c}</span>
                            <small>
                              {baseJobs.filter((j) => j.category === c).length}
                            </small>
                          </label>
                        ))}
                      </div>
                      <div className="filter-group">
                        <h3>WORK ARRANGEMENT</h3>
                        {[
                          ["", "All arrangements"],
                          ["Remote", "Remote"],
                          ["Hybrid", "Hybrid"],
                          ["On-site", "On-site"],
                          ["Not specified", "Not specified"],
                        ].map(([v, label]) => (
                          <label className="checkbox-row" key={label}>
                            <input
                              type="radio"
                              name="workplace"
                              value={v}
                              checked={workplace === v}
                              onChange={() => setWorkplace(v)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="filter-note">
                        <Info size={16} />
                        <p>
                          Remote doesn’t always mean anywhere. Check each role’s
                          location requirements.
                        </p>
                      </div>
                      <button
                        className="source-link"
                        onClick={() => nav("sources")}
                      >
                        Explore our sources <ArrowUpRight size={14} />
                      </button>
                    </aside>
                    <section
                      className="results"
                      aria-label="Opportunity results"
                    >
                      <div className="results-header">
                        <div>
                          <h2>
                            {tab === "saved"
                              ? "Saved opportunities"
                              : "Find your next move"}{" "}
                            <span>{filtered.length}</span>
                          </h2>
                          <p>
                            {query
                              ? `Results for “${query}”`
                              : tab === "fresher"
                                ? "New graduate and entry-level roles."
                                : "A fresh start could be one application away."}
                          </p>
                        </div>
                        <div className="result-controls">
                          <button
                            className="mobile-filter-button"
                            aria-label="Toggle filters"
                            onClick={() => setMobileFilters(!mobileFilters)}
                          >
                            <SlidersHorizontal size={18} />
                          </button>
                          <label className="sort-label">
                            <span>Sort:</span>
                            <select
                              aria-label="Sort opportunities"
                              value={sort}
                              onChange={(e) => setSort(e.target.value)}
                            >
                              <option value="updated">Recently updated</option>
                              <option value="company">Company A–Z</option>
                            </select>
                            <ChevronDown size={13} />
                          </label>
                        </div>
                      </div>
                      {(query ||
                        country ||
                        selected.length > 0 ||
                        workplace) && (
                        <div className="active-filters">
                          {query && (
                            <button
                              onClick={() => {
                                setQuery("");
                                setDraft("");
                              }}
                            >
                              {query}
                              <X size={12} />
                            </button>
                          )}
                          {country && (
                            <button onClick={() => setCountry("")}>
                              {country}
                              <X size={12} />
                            </button>
                          )}
                          {selected.map((c) => (
                            <button key={c} onClick={() => toggleCategory(c)}>
                              {c}
                              <X size={12} />
                            </button>
                          ))}
                          {workplace && (
                            <button onClick={() => setWorkplace("")}>
                              {workplace}
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      )}
                      {error && (
                        <div className="error-panel" role="alert">
                          <WifiOff size={18} />
                          <span>{error}</span>
                          <button onClick={load}>Retry</button>
                        </div>
                      )}
                      {data && healthy < data.sources.length && (
                        <div className="feed-warning">
                          <Info size={15} /> {data.sources.length - healthy}{" "}
                          company feed
                          {data.sources.length - healthy > 1
                            ? "s are"
                            : " is"}{" "}
                          unavailable. Some results may be out of date.
                        </div>
                      )}
                      {loading && !data ? (
                        <div className="job-grid">
                          {[1, 2, 3, 4].map((n) => (
                            <div className="job-card skeleton" key={n}>
                              <div />
                              <div />
                              <div />
                              <div />
                            </div>
                          ))}
                        </div>
                      ) : visible.length ? (
                        <div className="job-grid">
                          {visible.map((job) => {
                            const Icon = icons[job.category];
                            return (
                              <article className="job-card" key={job.id}>
                                <div className="job-card-top">
                                  <div className="company-identity">
                                    <CompanyLogo job={job} />
                                    <div>
                                      <span className="company-name">
                                        {job.company}
                                        <CheckCircle2
                                          size={12}
                                          aria-label="Official company feed"
                                        />
                                      </span>
                                      <span className="company-source">
                                        Official career listing
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    className={`bookmark-button ${savedIds.has(job.id) ? "is-saved" : ""}`}
                                    aria-label={`${savedIds.has(job.id) ? "Unsave" : "Save"} ${job.title}`}
                                    aria-pressed={savedIds.has(job.id)}
                                    onClick={() => toggleSaved(job)}
                                  >
                                    <Bookmark size={18} />
                                  </button>
                                </div>
                                <button
                                  className="job-title"
                                  onClick={() => setActive(job)}
                                >
                                  {job.title}
                                </button>
                                <p className="job-location">
                                  <MapPin size={14} />
                                  <span>{job.location}</span>
                                </p>
                                <div className="job-tags">
                                  <span>
                                    <Icon size={12} />
                                    {job.category}
                                  </span>
                                  <span>
                                    {job.opportunityType || "Internship"}
                                  </span>
                                  <span>{job.country || "Not specified"}</span>
                                  {job.workplace !== "Not specified" && (
                                    <span>{job.workplace}</span>
                                  )}
                                </div>
                                <p className="job-eligibility">
                                  Experience:{" "}
                                  {job.experience || "Not specified"} · Salary:{" "}
                                  {job.salary || "Not specified"}
                                </p>
                                {job.changeStatus && (
                                  <span className="change-badge">
                                    {job.changeStatus === "new"
                                      ? "New"
                                      : job.changeStatus === "updated"
                                        ? "Updated"
                                        : ""}
                                  </span>
                                )}
                                {(job.stale || job.notInFeed) && (
                                  <p className="stale-label">
                                    {job.notInFeed
                                      ? "No longer in the current feed — check availability"
                                      : "Source unavailable — check availability"}
                                  </p>
                                )}
                                <div className="job-card-bottom">
                                  <span title={date(job.updatedAt)}>
                                    <Clock3 size={12} />
                                    Source updated {relative(job.updatedAt)}
                                  </span>
                                  <a
                                    className="apply-link"
                                    href={job.applyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Apply <ArrowUpRight size={15} />
                                  </a>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state">
                          <Search size={30} />
                          <h3>
                            {tab === "saved" && !saved.length
                              ? "Your next chapter has a bookmark."
                              : "No matches just yet."}
                          </h3>
                          <p>
                            {tab === "saved" && !saved.length
                              ? "Save an internship with the bookmark icon and find it here."
                              : "Try another role, widen your location, or clear your filters. Our coverage is limited to the monitored companies."}
                          </p>
                          <button
                            className="secondary-button"
                            onClick={() =>
                              tab === "saved" && !saved.length
                                ? nav("discover")
                                : reset()
                            }
                          >
                            {tab === "saved" && !saved.length
                              ? "Explore internships"
                              : "Clear filters"}
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      )}
                      {filtered.length > 0 && (
                        <div className="pagination">
                          <span>
                            Showing {(currentPage - 1) * PER_PAGE + 1}–
                            {Math.min(currentPage * PER_PAGE, filtered.length)}{" "}
                            of {filtered.length} internships
                          </span>
                          <div>
                            <button
                              aria-label="Previous page"
                              disabled={currentPage === 1}
                              onClick={() => setPage(currentPage - 1)}
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <span>
                              {currentPage} / {pageCount}
                            </span>
                            <button
                              aria-label="Next page"
                              disabled={currentPage >= pageCount}
                              onClick={() => setPage(currentPage + 1)}
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="results-footnote">
                        <CheckCircle2 size={14} />
                        <span>
                          Apply directly on the company’s website. No middlemen,
                          just possibilities.
                        </span>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer>
            <span>
              InternConnect<span className="green-text">.</span>{" "}
              <span className="footer-tagline">
                A little direction for your next big step.
              </span>
            </span>
            <button onClick={() => setGuide(true)}>
              Coverage & freshness <ArrowUpRight size={12} />
            </button>
          </footer>
        </div>
      </main>
      <dialog
        ref={detailRef}
        className="detail-dialog"
        onCancel={() => setActive(null)}
        onClick={(e) => {
          if (e.target === detailRef.current) setActive(null);
        }}
      >
        {active && (
          <div className="dialog-inner">
            <button
              className="dialog-close"
              aria-label="Close internship details"
              onClick={() => setActive(null)}
            >
              <X size={22} />
            </button>
            <div className="detail-company">
              <CompanyLogo job={active} />
              <span>
                {active.company}
                <small>Official company career listing</small>
              </span>
            </div>
            <h2>{active.title}</h2>
            <p className="job-location">
              <MapPin size={16} />
              {active.location}
            </p>
            <div className="detail-meta">
              <span>
                Category
                <strong>{active.opportunityType || "Not specified"}</strong>
              </span>
              <span>
                Country<strong>{active.country || "Not specified"}</strong>
              </span>
              <span>
                Experience
                <strong>{active.experience || "Not specified"}</strong>
              </span>
              <span>
                Eligibility
                <strong>{active.eligibility || "Not specified"}</strong>
              </span>
              <span>
                Graduation year
                <strong>{active.graduationYear || "Not specified"}</strong>
              </span>
              <span>
                Duration<strong>{active.duration || "Not specified"}</strong>
              </span>
              <span>
                Salary / stipend
                <strong>{active.salary || "Not specified"}</strong>
              </span>
              <span>
                Source updated<strong>{date(active.updatedAt)}</strong>
              </span>
              <span>
                Deadline<strong>{date(detail?.deadline)}</strong>
              </span>
              <span>
                Last checked<strong>{relative(active.lastCheckedAt)}</strong>
              </span>
            </div>
            <div className="detail-actions">
              <a
                className="primary-button"
                href={active.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Apply on company website <ArrowUpRight size={16} />
              </a>
              <button
                className="secondary-button"
                onClick={() => toggleSaved(active)}
              >
                <Bookmark size={16} />
                {savedIds.has(active.id) ? "Saved" : "Save"}
              </button>
            </div>
            <div className="detail-description">
              <h3>About this opportunity</h3>
              {detailError ? (
                <p role="alert">{detailError}</p>
              ) : detail ? (
                <p className="description-text">
                  {detail.description ||
                    "Visit the official listing for the full job description."}
                </p>
              ) : (
                <p className="loading-description">
                  Loading the company’s job description…
                </p>
              )}
            </div>
            <p className="detail-disclaimer">
              Confirm work authorization, eligibility, and availability on the
              official listing. Remote roles may have location restrictions.
            </p>
          </div>
        )}
      </dialog>
      <dialog
        ref={guideRef}
        className="guide-dialog"
        onCancel={() => setGuide(false)}
        onClick={(e) => {
          if (e.target === guideRef.current) setGuide(false);
        }}
      >
        <div className="dialog-inner">
          <button
            className="dialog-close"
            aria-label="Close information"
            onClick={() => setGuide(false)}
          >
            <X size={22} />
          </button>
          <span className="brand-symbol">
            <Radar size={27} />
          </span>
          <h2>Your search, with a little more clarity.</h2>
          <p>
            InternConnect searches opportunities from your own monitored company
            career portals.
          </p>
          <h3>Real sources. Clear limits.</h3>
          <p>
            Public Greenhouse, Lever, Ashby, and SmartRecruiters feeds are
            supported. Workday and unsupported company portals are clearly
            flagged rather than scraped.
          </p>
          <h3>How fresh are the results?</h3>
          <p>
            The server checks each enabled company on its configured interval.
            The dashboard refreshes its data every 15 seconds without reloading
            the page. “Source updated” is the employer feed timestamp, not
            necessarily the original posting date.
          </p>
          <h3>Your applications stay with the company.</h3>
          <p>
            Apply buttons take you to the employer-provided application link.
            Eligibility and deadlines are not inferred if the source does not
            provide them.
          </p>
          <button className="primary-button" onClick={() => setGuide(false)}>
            Got it <Check size={16} />
          </button>
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<SearchPlatform />);
