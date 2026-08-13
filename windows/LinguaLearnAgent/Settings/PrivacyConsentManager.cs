using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LinguaLearnAgent.Settings;

public class SettingsData
{
    public string ApiUrl { get; set; } = "https://145.239.82.124.sslip.io/english";
    public string ProtectedDeviceToken { get; set; } = string.Empty;
    public bool IsPaused { get; set; } = false;
    public List<string> DeniedApps { get; set; } = new();
}

public class PrivacyConsentManager
{
    private readonly string _settingsFilePath;
    private SettingsData _data = new();
    private string _inMemoryDeviceToken = string.Empty;

    public string ApiUrl
    {
        get => string.IsNullOrWhiteSpace(_data.ApiUrl) ? "https://145.239.82.124.sslip.io/english" : _data.ApiUrl;
        set
        {
            _data.ApiUrl = string.IsNullOrWhiteSpace(value) ? "https://145.239.82.124.sslip.io/english" : value.Trim();
        }
    }

    public string DeviceToken
    {
        get => _inMemoryDeviceToken;
        set
        {
            _inMemoryDeviceToken = value ?? string.Empty;
            _data.ProtectedDeviceToken = ProtectToken(_inMemoryDeviceToken);
        }
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

    public static string ProtectToken(string token)
    {
        if (string.IsNullOrEmpty(token)) return string.Empty;
        try
        {
            if (OperatingSystem.IsWindows())
            {
                byte[] plainBytes = Encoding.UTF8.GetBytes(token);
                byte[] cipherBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
                return "DPAPI:" + Convert.ToBase64String(cipherBytes);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PrivacyConsentManager] DPAPI Protect failed: {ex.Message}");
        }
        return "PLAIN:" + token;
    }

    public static string UnprotectToken(string protectedToken)
    {
        if (string.IsNullOrEmpty(protectedToken)) return string.Empty;
        if (protectedToken.StartsWith("DPAPI:"))
        {
            try
            {
                if (OperatingSystem.IsWindows())
                {
                    byte[] cipherBytes = Convert.FromBase64String(protectedToken.Substring(6));
                    byte[] plainBytes = ProtectedData.Unprotect(cipherBytes, null, DataProtectionScope.CurrentUser);
                    return Encoding.UTF8.GetString(plainBytes);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PrivacyConsentManager] DPAPI Unprotect failed: {ex.Message}");
            }
        }
        else if (protectedToken.StartsWith("PLAIN:"))
        {
            return protectedToken.Substring(6);
        }
        return protectedToken;
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
                    _inMemoryDeviceToken = UnprotectToken(_data.ProtectedDeviceToken);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PrivacyConsentManager] Load failed: {ex.Message}");
        }
    }
}
