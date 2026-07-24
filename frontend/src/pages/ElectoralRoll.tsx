import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Upload,
  Users,
  MapPin,
  Building2,
  Database,
  UserPlus,
  FileText,
  RefreshCw,
  Check,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { eraApi } from "../services/api";
import { webSocketService } from "../services/websocket";

interface ERAStats {
  total_records: number;
  total_uploads: number;
  by_state: Record<string, number>;
  top_divisions: { division: string; count: number }[];
  total_matches: number;
  verified_matches: number;
}

interface ERARecord {
  id: number;
  given_names: string;
  surname: string;
  full_address: string;
  locality: string;
  postcode: string;
  federal_division: string;
  state_district?: string;
  enrolled_date?: string;
}

interface SearchResult extends ERARecord {
  overall_score: number;
  name_score: number;
  address_score: number;
}

export function ElectoralRoll() {
  const [activeTab, setActiveTab] = useState<"search" | "browse" | "recruit" | "manage">("search");
  const [stats, setStats] = useState<ERAStats | null>(null);
  const [_loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Search state
  const [searchSurname, setSearchSurname] = useState("");
  const [searchGiven, setSearchGiven] = useState("");
  const [searchLocality, setSearchLocality] = useState("");
  const [searchPostcode, setSearchPostcode] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Browse state
  const [divisions, setDivisions] = useState<{ division: string; count: number }[]>([]);
  const [selectedDivision, setSelectedDivision] = useState("");
  const [browseResults, setBrowseResults] = useState<ERARecord[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browsePage, setBrowsePage] = useState(0);

  // Disk files state (for resume)
  const [diskFiles, setDiskFiles] = useState<{ filename: string; size_mb: number }[]>([]);
  const [parsing, setParsing] = useState(false);
  const [uploads, setUploads] = useState<{ id: number; filename: string; record_count: number; status: string }[]>([]);

  useEffect(() => {
    fetchStats();
    fetchDivisions();
    fetchDiskFiles();
    fetchUploads();
    
    fetchUploads();
    
    // Subscribe to ERA updates
    const handleEraUpdate = (data: any) => {
        setUploads(data.uploads);
        setStats((prev) => prev ? ({ ...prev, total_records: data.total_records }) : null);
    };

    webSocketService.subscribe("era", handleEraUpdate);
    
    return () => {
        webSocketService.unsubscribe("era", handleEraUpdate);
    };
  }, []);

  const fetchStats = async () => {
    try {
      const data = await eraApi.getStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch ERA stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDivisions = async () => {
    try {
      const data = await eraApi.getDivisions();
      setDivisions(data);
    } catch (error) {
      console.error("Failed to fetch divisions:", error);
    }
  };

  const fetchDiskFiles = async () => {
    try {
      const files = await eraApi.getFiles();
      setDiskFiles(files);
    } catch (error) {
      console.error("Failed to fetch disk files:", error);
    }
  };

  const fetchUploads = async () => {
    try {
      const data = await eraApi.getUploads();
      setUploads(data);
    } catch (error) {
      console.error("Failed to fetch uploads:", error);
    }
  };

  const handleParseFromDisk = async (filename: string, clearExisting: boolean) => {
    if (!confirm(`${clearExisting ? 'Clear existing data and parse' : 'Parse'} ${filename}? This will run in the background.`)) {
      return;
    }
    setParsing(true);
    try {
      await eraApi.parseFromDisk(filename, clearExisting);
      alert(`Started parsing ${filename}. Check stats for progress (updates every 100k records).`);
      setTimeout(fetchStats, 2000);
    } catch (error) {
      console.error("Parse from disk failed:", error);
      alert("Failed to start parsing. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchSurname.trim()) return;
    setSearching(true);
    try {
      const results = await eraApi.search({
        surname: searchSurname,
        given_names: searchGiven || undefined,
        locality: searchLocality || undefined,
        postcode: searchPostcode || undefined,
        limit: 50,
      });
      setSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleBrowse = async (division?: string, page: number = 0) => {
    setLoading(true);
    try {
      const data = await eraApi.browse({
        federal_division: division || selectedDivision || undefined,
        skip: page * 50,
        limit: 50,
      });
      setBrowseResults(data.records);
      setBrowseTotal(data.total);
      setBrowsePage(page);
    } catch (error) {
      console.error("Browse failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await eraApi.uploadFile(file);
      await fetchStats();
      alert("ERA file upload started. Records will be processed in the background.");
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-400";
    if (score >= 80) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 90) return "bg-green-900/30 border-green-700";
    if (score >= 80) return "bg-yellow-900/30 border-yellow-700";
    return "bg-red-900/30 border-red-700";
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild className="text-slate-400 hover:text-white">
                <Link to="/">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                  Electoral Roll
                </h1>
                <p className="text-slate-400 text-sm">ERA Data Browser & Matching</p>
              </div>
            </div>

            {/* Stats summary */}
            {stats && (
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <span className="text-slate-300">{stats.total_records.toLocaleString()} records</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-slate-300">{stats.total_matches} matches</span>
                </div>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 mt-4">
            {[
              { id: "search", label: "Fuzzy Search", icon: Search },
              { id: "browse", label: "Browse", icon: FileText },
              { id: "recruit", label: "Recruitment", icon: UserPlus },
              { id: "manage", label: "Manage", icon: Upload },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Search Tab */}
        {activeTab === "search" && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-400" />
                Fuzzy Name Search
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Search the electoral roll by name. Results are ranked by match confidence.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Surname *</label>
                  <input
                    type="text"
                    value={searchSurname}
                    onChange={(e) => setSearchSurname(e.target.value)}
                    placeholder="Enter surname"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Given Names</label>
                  <input
                    type="text"
                    value={searchGiven}
                    onChange={(e) => setSearchGiven(e.target.value)}
                    placeholder="Enter given names"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Suburb/Locality</label>
                  <input
                    type="text"
                    value={searchLocality}
                    onChange={(e) => setSearchLocality(e.target.value)}
                    placeholder="Enter suburb"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Postcode</label>
                  <input
                    type="text"
                    value={searchPostcode}
                    onChange={(e) => setSearchPostcode(e.target.value)}
                    placeholder="Enter postcode"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              <Button
                onClick={handleSearch}
                disabled={!searchSurname.trim() || searching}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {searching ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search Electoral Roll
                  </>
                )}
              </Button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">
                  Found {searchResults.length} matches
                </h3>
                <div className="space-y-3">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className={`p-4 rounded-lg border ${getScoreBg(result.overall_score)}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-white">
                              {result.given_names} {result.surname}
                            </span>
                            <span className={`text-sm font-bold ${getScoreColor(result.overall_score)}`}>
                              {result.overall_score}% match
                            </span>
                          </div>
                          <div className="text-slate-400 text-sm mt-1">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            {result.full_address}
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-slate-500">
                            <span>
                              <Building2 className="w-3 h-3 inline mr-1" />
                              {result.federal_division}
                            </span>
                            <span>Name: {result.name_score}%</span>
                            <span>Address: {result.address_score}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Browse Tab */}
        {activeTab === "browse" && (
          <div className="max-w-6xl mx-auto">
            <div className="flex gap-6">
              {/* Division Sidebar */}
              <div className="w-64 shrink-0">
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 sticky top-32">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Federal Divisions
                  </h3>
                  <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                    {divisions.map((div) => (
                      <button
                        key={div.division}
                        onClick={() => {
                          setSelectedDivision(div.division);
                          handleBrowse(div.division, 0);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                          selectedDivision === div.division
                            ? "bg-indigo-600 text-white"
                            : "text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        <span>{div.division}</span>
                        <span className="text-xs opacity-70">{div.count.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Results */}
              <div className="flex-1">
                {selectedDivision ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">
                        {selectedDivision}
                        <span className="text-slate-400 text-sm font-normal ml-2">
                          ({browseTotal.toLocaleString()} electors)
                        </span>
                      </h2>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBrowse(selectedDivision, Math.max(0, browsePage - 1))}
                          disabled={browsePage === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBrowse(selectedDivision, browsePage + 1)}
                          disabled={(browsePage + 1) * 50 >= browseTotal}
                        >
                          Next
                        </Button>
                      </div>
                    </div>

                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-900">
                          <tr>
                            <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Name</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Address</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Locality</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Enrolled</th>
                          </tr>
                        </thead>
                        <tbody>
                          {browseResults.map((record) => (
                            <tr key={record.id} className="border-t border-slate-700 hover:bg-slate-700/50">
                              <td className="px-4 py-3 text-sm">
                                {record.given_names} {record.surname}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-400">{record.full_address}</td>
                              <td className="px-4 py-3 text-sm">
                                {record.locality} {record.postcode}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-500">{record.enrolled_date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Select a federal division to browse electors</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recruitment Tab */}
        {activeTab === "recruit" && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-green-400" />
                Recruitment Targeting
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Find potential recruitment targets based on existing members. 
                Identify people at the same address or with matching surnames.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    Household Targeting
                  </h3>
                  <p className="text-sm text-slate-400 mb-3">
                    Find others living at the same address as existing members.
                    Great for family recruitment.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const targets = await eraApi.getRecruitmentTargets({
                        include_same_address: true,
                        include_same_surname: false,
                        limit: 100,
                      });
                      console.log("Household targets:", targets);
                      alert(`Found ${targets.length} household targets. Check console for details.`);
                    }}
                  >
                    Find Household Targets
                  </Button>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    Surname Targeting
                  </h3>
                  <p className="text-sm text-slate-400 mb-3">
                    Find people with the same surname as existing members.
                    Useful for extended family outreach.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const targets = await eraApi.getRecruitmentTargets({
                        include_same_address: false,
                        include_same_surname: true,
                        limit: 100,
                      });
                      console.log("Surname targets:", targets);
                      alert(`Found ${targets.length} surname targets. Check console for details.`);
                    }}
                  >
                    Find Surname Matches
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4">
              <p className="text-amber-300 text-sm">
                <strong>Note:</strong> Recruitment targeting requires ERA data to be loaded. 
                The current dataset contains Victorian electors only.
              </p>
            </div>
          </div>
        )}

        {/* Manage Tab */}
        {activeTab === "manage" && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-400" />
                Upload ERA File
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Upload AEC Electoral Roll Access (.txt) files. Large files are processed in the background.
              </p>

              <label className="block">
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 transition-colors">
                  {uploading ? (
                    <>
                      <RefreshCw className="w-12 h-12 mx-auto mb-4 text-indigo-400 animate-spin" />
                      <p className="text-slate-300">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                      <p className="text-slate-300">Click to select ERA .txt file</p>
                      <p className="text-slate-500 text-sm mt-1">or drag and drop</p>
                    </>
                  )}
                </div>
              </label>
            </div>

            {/* Active Parsing Jobs */}
            {uploads.filter(u => u.status === 'parsing').length > 0 && (
              <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 rounded-xl p-6 border border-indigo-500/50 mb-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                  Parsing in Progress
                </h2>
                <div className="space-y-3">
                  {uploads.filter(u => u.status === 'parsing').map((upload) => (
                    <div key={upload.id} className="bg-slate-800/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{upload.filename}</span>
                        <span className="text-indigo-400 font-mono text-lg">
                          {upload.record_count.toLocaleString()} records
                        </span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                          style={{ width: `${Math.min((upload.record_count / 5000000) * 100, 99)}%` }}
                        />
                      </div>
                      <p className="text-slate-400 text-sm mt-2">
                        Estimated: ~{((5000000 - upload.record_count) / 100000 * 2).toFixed(0)} seconds remaining
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files on Disk */}
            {diskFiles.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-400" />
                  Files on Disk
                </h2>
                <p className="text-slate-400 text-sm mb-4">
                  ERA files available for parsing. Use "Resume Parse" to continue after a server restart.
                </p>
                <div className="space-y-3">
                  {diskFiles.map((file) => (
                    <div
                      key={file.filename}
                      className="flex items-center justify-between bg-slate-700/50 rounded-lg p-4 border border-slate-600"
                    >
                      <div>
                        <div className="font-medium text-white">{file.filename}</div>
                        <div className="text-slate-400 text-sm">{file.size_mb} MB</div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleParseFromDisk(file.filename, false)}
                          disabled={parsing}
                        >
                          {parsing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            "Resume Parse"
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleParseFromDisk(file.filename, true)}
                          disabled={parsing}
                          className="text-red-400 hover:text-red-300 hover:border-red-400"
                        >
                          Clear & Reparse
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Statistics */}
            {stats && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="text-3xl font-bold text-indigo-400">{stats.total_records.toLocaleString()}</div>
                  <div className="text-slate-400 text-sm">Total Records</div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="text-3xl font-bold text-green-400">{stats.total_matches}</div>
                  <div className="text-slate-400 text-sm">Member Matches</div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="text-3xl font-bold text-purple-400">{stats.total_uploads}</div>
                  <div className="text-slate-400 text-sm">Uploads</div>
                </div>
              </div>
            )}

            {/* Top Divisions */}
            {stats?.top_divisions && stats.top_divisions.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">Top Divisions by Population</h3>
                <div className="space-y-2">
                  {stats.top_divisions.map((div, i) => (
                    <div key={div.division} className="flex items-center justify-between">
                      <span className="text-slate-300">
                        <span className="text-slate-500 text-sm mr-2">#{i + 1}</span>
                        {div.division}
                      </span>
                      <span className="text-indigo-400 font-mono">{div.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ElectoralRoll;
