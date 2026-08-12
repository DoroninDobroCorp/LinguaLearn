import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Laptop, KeyRound, Copy, Check, Trash2, AlertTriangle, Plus, RefreshCw, 
  ShieldCheck, CheckCircle2, Info, X, SlidersHorizontal
} from "lucide-react";

export default function DeviceManagement() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Token creation modal state
  const [deviceName, setDeviceName] = useState("My Mac");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdToken, setCreatedToken] = useState("");
  const [copied, setCopied] = useState(false);

  // Revoke confirmation modal state
  const [revokingId, setRevokingId] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    setLoading(true);
    setError("");
    try {
      let res = await fetch("/english/api/devices/tokens", { credentials: "same-origin" });
      if (!res.ok) {
        res = await fetch("/api/devices/tokens", { credentials: "same-origin" });
      }
      if (res.ok) {
        const data = await res.json();
        setDevices(data.tokens || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to load registered devices.");
      }
    } catch (err) {
      setError(err.message || "Network error loading devices.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateToken = async (e) => {
    e.preventDefault();
    const trimmed = deviceName.trim();
    if (!trimmed) {
      setCreateError("Device name is required.");
      return;
    }

    setCreating(true);
    setCreateError("");
    setCreatedToken("");

    try {
      let res = await fetch("/english/api/devices/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ device_name: trimmed, app_version: "1.0.0" }),
      });
      if (!res.ok) {
        res = await fetch("/api/devices/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ device_name: trimmed, app_version: "1.0.0" }),
        });
      }

      if (res.ok) {
        const data = await res.json();
        setCreatedToken(data.token);
        fetchDevices();
      } else {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.error || "Failed to create device token.");
      }
    } catch (err) {
      setCreateError(err.message || "Network error creating token.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (tokenId) => {
    setRevokeLoading(true);
    try {
      let res = await fetch(`/english/api/devices/tokens/${tokenId}/revoke`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        res = await fetch(`/api/devices/tokens/${tokenId}/revoke`, {
          method: "POST",
          credentials: "same-origin",
        });
      }

      if (res.ok) {
        fetchDevices();
        setRevokingId(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to revoke device token.");
      }
    } catch (err) {
      alert("Network error revoking token.");
    } finally {
      setRevokeLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCreatedToken("");
    setDeviceName("My Mac");
    setCreateError("");
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Never active";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString() + " at " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <Link
          to="/settings"
          className="px-6 py-3 font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-b-2 border-transparent flex items-center space-x-2"
        >
          <SlidersHorizontal className="h-5 w-5" />
          <span>General Settings</span>
        </Link>
        <Link
          to="/settings/devices"
          className="px-6 py-3 font-semibold text-yellow-600 dark:text-yellow-400 border-b-2 border-yellow-400 dark:border-yellow-400 flex items-center space-x-2"
        >
          <Laptop className="h-5 w-5" />
          <span>Mac Devices & Tokens</span>
        </Link>
      </div>

      {/* Main Container */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6 border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center space-x-3">
              <Laptop className="h-8 w-8 text-yellow-500" />
              <span>Mac Devices</span>
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Manage authorization tokens for Mac capture agents running background English writing capture.
            </p>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            data-testid="create-device-token-btn"
            className="px-5 py-2.5 bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold rounded-xl shadow-lg hover:scale-105 transition-all flex items-center justify-center space-x-2 self-start sm:self-auto"
          >
            <Plus className="h-5 w-5" />
            <span>Create Device Token</span>
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12 space-x-3 text-gray-500 dark:text-gray-400">
            <RefreshCw className="h-6 w-6 animate-spin text-yellow-500" />
            <span>Loading registered devices...</span>
          </div>
        ) : devices.length === 0 ? (
          /* Empty State */
          <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 space-y-4">
            <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 mx-auto flex items-center justify-center">
              <KeyRound className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No Mac Devices Registered</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Create a device token to authorize your Mac Desktop Agent to send written English text for analysis.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-6 py-2.5 bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold rounded-xl shadow-md hover:scale-105 transition-all"
            >
              Generate First Token
            </button>
          </div>
        ) : (
          /* Devices Table / List */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="devices-table">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Device Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Active</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-sm">
                {devices.map((device) => {
                  const isRevoked = Boolean(device.revoked_at);
                  return (
                    <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors" data-testid={`device-row-${device.id}`}>
                      <td className="py-4 px-4 font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                        <Laptop className={`h-5 w-5 ${isRevoked ? "text-gray-400" : "text-yellow-500"}`} />
                        <span>{device.device_name}</span>
                        {device.app_version && (
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            v{device.app_version}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {isRevoked ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-gray-600 dark:text-gray-300">
                        {formatDate(device.last_used_at)}
                      </td>
                      <td className="py-4 px-4 text-gray-500 dark:text-gray-400 text-xs">
                        {formatDate(device.created_at)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {!isRevoked ? (
                          <button
                            onClick={() => setRevokingId(device.id)}
                            data-testid={`revoke-device-btn-${device.id}`}
                            className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all flex items-center space-x-1 ml-auto"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No actions</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Token Creation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" data-testid="token-creation-modal">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 border border-gray-100 dark:border-gray-700 relative">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="h-5 w-5" />
            </button>

            {!createdToken ? (
              /* Create Form */
              <form onSubmit={handleCreateToken} className="space-y-5">
                <div className="flex items-center space-x-3">
                  <div className="p-3 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400">
                    <KeyRound className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Create Mac Device Token</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Generate a secret token for your Mac Desktop Agent.
                    </p>
                  </div>
                </div>

                {createError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-semibold">
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Device Name
                  </label>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="e.g. Work MacBook Pro"
                    data-testid="device-name-input"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-yellow-400 outline-none text-sm font-medium"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    data-testid="generate-token-submit-btn"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold text-sm shadow-md hover:scale-105 transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    <span>{creating ? "Generating..." : "Generate Token"}</span>
                  </button>
                </div>
              </form>
            ) : (
              /* One-Time Token Display */
              <div className="space-y-5 animate-fade-in" data-testid="one-time-token-view">
                <div className="flex items-center space-x-3 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-7 w-7 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Token Generated Successfully!</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Save this key in your Mac app configuration now.</p>
                  </div>
                </div>

                {/* Secret Token Box */}
                <div className="p-4 rounded-xl bg-gray-900 border border-gray-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Device Token (Bearer)</span>
                    <button
                      onClick={() => copyToClipboard(createdToken)}
                      data-testid="copy-token-btn"
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold text-xs transition-all"
                    >
                      {copied ? <Check className="h-4 w-4 text-gray-900" /> : <Copy className="h-4 w-4" />}
                      <span>{copied ? "Copied!" : "Copy Token"}</span>
                    </button>
                  </div>
                  <div className="p-3 rounded-lg bg-black/60 font-mono text-sm text-yellow-300 break-all select-all font-semibold" data-testid="token-secret-text">
                    {createdToken}
                  </div>
                </div>

                {/* Security Warning */}
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5">Important Security Warning:</span>
                    This token is displayed <strong>ONLY ONCE</strong>. It is saved securely as an encrypted hash and cannot be recovered if lost.
                  </div>
                </div>

                {/* Setup Guide */}
                <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                  <span className="font-bold block text-blue-950 dark:text-blue-100">Mac Desktop Setup:</span>
                  <p>In your Mac capture agent settings or launch configuration, pass:</p>
                  <code className="block p-2 rounded bg-blue-100/80 dark:bg-blue-950/80 font-mono text-blue-900 dark:text-blue-300 select-all">
                    CAPTURE_API_TOKEN={createdToken}
                  </code>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={closeModal}
                    data-testid="close-token-modal-btn"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-extrabold text-sm shadow-md hover:scale-105 transition-all"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" data-testid="revoke-confirm-modal">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-7 w-7 flex-shrink-0" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Revoke Device Token?</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to revoke this device token? The Mac capture agent using this token will immediately be denied access and will no longer send writing samples.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setRevokingId(null)}
                className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(revokingId)}
                disabled={revokeLoading}
                data-testid="confirm-revoke-btn"
                className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold text-sm shadow-md hover:bg-red-700 transition-all flex items-center space-x-1.5 disabled:opacity-50"
              >
                {revokeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>{revokeLoading ? "Revoking..." : "Yes, Revoke Token"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
