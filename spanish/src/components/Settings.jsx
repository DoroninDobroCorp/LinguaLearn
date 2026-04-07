import React, { useState, useEffect } from 'react';
import { Save, Info } from 'lucide-react';
import { profileApiUrl } from '../utils/api';

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
  const [maxLevel, setMaxLevel] = useState('B2');
  const [saved, setSaved] = useState(false);
  
  useEffect(() => {
    fetchSettings();
  }, []);
  
  const fetchSettings = async () => {
    try {
      const response = await fetch(profileApiUrl('/spanish/api/settings'));
      const data = await response.json();
      setMaxLevel(data.max_level);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };
  
  const saveSettings = async () => {
    try {
      await fetch(profileApiUrl('/spanish/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxLevel }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };
  
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-2xl p-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Settings</h2>
        
        <div className="space-y-6">
          {/* Уровень */}
          <div>
            <label className="block text-lg font-semibold text-gray-800 mb-3">
              Maximum Spanish Level
            </label>
            <p className="text-sm text-gray-600 mb-4">
              Topics above this level will be ignored. This helps you focus on tasks relevant to your current level.
            </p>
            
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setMaxLevel(level)}
                  className={`px-4 py-3 rounded-lg font-semibold transition-all ${
                    maxLevel === level
                      ? 'bg-gradient-to-r from-fuchsia-400 to-purple-400 text-fuchsia-900 shadow-md scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            
            {/* Описание выбранного уровня */}
            <div className="mt-4 p-4 bg-gradient-to-r from-pink-50 to-violet-50 rounded-xl border-2 border-pink-200">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-fuchsia-700 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-fuchsia-900 mb-1">{maxLevel}</p>
                  <p className="text-sm text-fuchsia-800">{LEVEL_DESCRIPTIONS[maxLevel]}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Информационный блок */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-5 border-2 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">How does it work?</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li>• The assistant tracks your mistakes during conversations</li>
              <li>• When you make a mistake, a topic is created with a difficulty level</li>
              <li>• Topics above your maximum level are ignored</li>
              <li>• Successful use of a topic adds +5 to progress</li>
              <li>• Mistakes subtract -10 (more significant for focus)</li>
              <li>• Topics with low progress have priority in exercises</li>
            </ul>
          </div>
          
          {/* Кнопка сохранения */}
          <div className="flex items-center space-x-4">
            <button
              onClick={saveSettings}
              className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-fuchsia-400 to-purple-400 text-fuchsia-900 rounded-xl hover:from-fuchsia-500 hover:to-purple-500 transition-all shadow-md hover:shadow-lg font-semibold"
            >
              <Save className="h-5 w-5" />
              <span>Save Settings</span>
            </button>
            
            {saved && (
              <span className="text-green-600 font-medium animate-pulse">
                ✓ Saved!
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
