import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Save, Info, SlidersHorizontal, Laptop, Download, Trash2, Shield, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LEVEL_DESCRIPTIONS = {
  'A1': 'Beginner - basic phrases and simple grammar',
  'A2': 'Elementary - simple everyday communication',
  'B1': 'Intermediate - confident communication on familiar topics',
  'B2': 'Upper-Intermediate - fluent communication in most situations',
  'C1': 'Advanced - complex texts and spontaneous speech',
  'C2': 'Mastery - practically native speaker level',
};

function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [maxLevel, setMaxLevel] = useState('B2');
  const [capturePaused, setCapturePaused] = useState(false);
  const [retentionDays, setRetentionDays] = useState(7);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  
  useEffect(() => {
    fetchSettings();
  }, []);
  
  const fetchSettings = async () => {
    try {
      let response = await fetch('/english/api/user/settings', { credentials: 'same-origin' });
      if (!response.ok) {
        response = await fetch('/api/user/settings', { credentials: 'same-origin' });
      }
      if (response.ok) {
        const data = await response.json();
        if (data.max_level) setMaxLevel(data.max_level);
        if (data.cefr_level) setMaxLevel(data.cefr_level);
        setCapturePaused(Boolean(data.capture_paused));
        if (data.retention_days !== undefined) setRetentionDays(data.retention_days);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };
  
  const saveSettings = async () => {
    try {
      let res = await fetch('/english/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          max_level: maxLevel,
          cefr_level: maxLevel,
          capture_paused: capturePaused ? 1 : 0,
          retention_days: retentionDays
        }),
      });
      if (!res.ok) {
        res = await fetch('/api/user/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            max_level: maxLevel,
            cefr_level: maxLevel,
            capture_paused: capturePaused ? 1 : 0,
            retention_days: retentionDays
          }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      let res = await fetch('/english/api/user/export', { credentials: 'same-origin' });
      if (!res.ok) {
        res = await fetch('/api/user/export', { credentials: 'same-origin' });
      }
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lingualearn-user-data-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to export user data.');
      }
    } catch (err) {
      alert('Error exporting data: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm account deletion.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      let res = await fetch('/english/api/user/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ confirm: true, confirmation: 'DELETE' })
      });
      if (!res.ok) {
        res = await fetch('/api/user/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ confirm: true, confirmation: 'DELETE' })
        });
      }
      if (res.ok) {
        setDeleteModalOpen(false);
        if (logout) logout();
        navigate('/login');
      } else {
        const err = await res.json().catch(() => ({}));
        setDeleteError(err.error || 'Failed to delete account.');
      }
    } catch (err) {
      setDeleteError('Error deleting account: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <Link
          to="/settings"
          className="px-6 py-3 font-semibold text-yellow-600 dark:text-yellow-400 border-b-2 border-yellow-400 dark:border-yellow-400 flex items-center space-x-2"
        >
          <SlidersHorizontal className="h-5 w-5" />
          <span>General Settings</span>
        </Link>
        <Link
          to="/settings/devices"
          className="px-6 py-3 font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-b-2 border-transparent flex items-center space-x-2"
        >
          <Laptop className="h-5 w-5" />
          <span>Mac Devices & Tokens</span>
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700 space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">General Settings</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure learning curriculum difficulty, writing capture policies, and data privacy.
          </p>
        </div>
        
        <div className="space-y-6">
          {/* Level Selection */}
          <div>
            <label className="block text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Maximum English Level
            </label>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Topics above this level will be ignored. This helps you focus on tasks relevant to your current level.
            </p>
            
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setMaxLevel(level)}
                  className={`px-4 py-3 rounded-lg font-semibold transition-all ${
                    maxLevel === level
                      ? 'bg-gradient-to-r from-yellow-400 to-lime-400 text-yellow-900 shadow-md scale-105'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            
            {/* Selected Level Description */}
            <div className="mt-4 p-4 bg-gradient-to-r from-yellow-50 to-lime-50 dark:from-yellow-950/30 dark:to-lime-950/30 rounded-xl border-2 border-yellow-200 dark:border-yellow-800/50">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-yellow-700 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">{maxLevel}</p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">{LEVEL_DESCRIPTIONS[maxLevel]}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Capture Pause Toggle */}
          <div className="p-5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <Shield className="h-5 w-5 text-yellow-500" />
              <span>Capture & Privacy Controls</span>
            </h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Pause Writing Capture</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Temporarily pause background capture from native Mac, Android, and iOS clients.
                </p>
              </div>
              <input
                type="checkbox"
                checked={capturePaused}
                onChange={(e) => setCapturePaused(e.target.checked)}
                className="h-5 w-5 rounded text-yellow-500 focus:ring-yellow-400 cursor-pointer"
              />
            </div>
          </div>
          
          {/* How does it work info card */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-xl p-5 border-2 border-blue-200 dark:border-blue-800/50">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">How does scoring work?</h3>
            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
              <li>• Assistant analyzes your writing during conversations and native desktop usage</li>
              <li>• Objective grammar mistakes update topic evidence (-2 delta)</li>
              <li>• Mechanical typos, style suggestions, and correct sentences do not penalize your score</li>
              <li>• Topics above your maximum level are filtered from negative scoring</li>
              <li>• Topics with lower mastery have priority in daily practice exercises</li>
            </ul>
          </div>
          
          {/* Save Button */}
          <div className="flex items-center space-x-4">
            <button
              onClick={saveSettings}
              className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-yellow-400 to-lime-400 text-yellow-900 font-bold rounded-xl hover:from-yellow-500 hover:to-lime-500 transition-all shadow-md hover:shadow-lg"
            >
              <Save className="h-5 w-5" />
              <span>Save Settings</span>
            </button>
            
            {saved && (
              <span className="text-green-600 dark:text-green-400 font-medium flex items-center space-x-1 animate-pulse">
                <Check className="h-4 w-4" />
                <span>Saved successfully!</span>
              </span>
            )}
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* User Data Rights & GDPR Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <Shield className="h-6 w-6 text-yellow-500" />
            <span>User Data Rights & Privacy</span>
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Export your entire learning history as JSON, or permanently delete your account across all 11 domain tables.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 font-semibold text-sm transition-all"
            >
              {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span>Export My Data (JSON)</span>
            </button>

            <button
              onClick={() => setDeleteModalOpen(true)}
              className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 font-semibold text-sm transition-all"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Account & Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-7 w-7 flex-shrink-0" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Permanent Account Deletion</h3>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This action is <strong>irreversible</strong>. All your grammar progress, writing samples, practice sessions, vocabulary, and registered device tokens will be permanently deleted.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-semibold">
                {deleteError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Type <strong>DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmationText('');
                  setDeleteError('');
                }}
                className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmationText !== 'DELETE'}
                className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold text-sm shadow-md hover:bg-red-700 transition-all flex items-center space-x-1.5 disabled:opacity-50"
              >
                {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>Permanently Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
