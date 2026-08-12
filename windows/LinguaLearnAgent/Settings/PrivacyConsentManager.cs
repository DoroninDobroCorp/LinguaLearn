using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace LinguaLearnAgent.Settings;

public class SettingsData
{
    public string DeviceToken { get; set; } = string.Empty;
    public bool IsPaused { get; set; } = false;
    public List<string> DeniedApps { get; set; } = new();
}

public class PrivacyConsentManager
{
    private readonly string _settingsFilePath;
    private SettingsData _data = new();

    public string DeviceToken
    {
        get => _data.DeviceToken;
        set => _data.DeviceToken = value;
    }

    public bool IsPaused
    {
        get => _data.IsPaused;
        set => _data.IsPaused = value;
    }

    public List<string> DeniedApps => _data.DeniedApps;

    public PrivacyConsentManager(string? customPath = null)
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string folder = Path.Combine(appData, "LinguaLearnAgent");
        Directory.CreateDirectory(folder);
        _settingsFilePath = customPath ?? Path.Combine(folder, "settings.json");
        Load();
    }

    public void Save()
    {
        try
        {
            string json = JsonSerializer.Serialize(_data, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_settingsFilePath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PrivacyConsentManager] Save failed: {ex.Message}");
        }
    }

    public void Load()
    {
        try
        {
            if (File.Exists(_settingsFilePath))
            {
                string json = File.ReadAllText(_settingsFilePath);
                var loaded = JsonSerializer.Deserialize<SettingsData>(json);
                if (loaded != null)
                {
                    _data = loaded;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PrivacyConsentManager] Load failed: {ex.Message}");
        }
    }
}
