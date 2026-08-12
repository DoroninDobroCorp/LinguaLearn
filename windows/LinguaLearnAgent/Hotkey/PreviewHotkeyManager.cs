using System;
using System.Runtime.InteropServices;

namespace LinguaLearnAgent.Hotkey;

public class PreviewHotkeyManager : IDisposable
{
    public bool IsPreviewOnly { get; set; } = false;

    private const int HOTKEY_ID = 9000;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_ALT = 0x0001;
    private const uint VK_P = 0x50;

    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public PreviewHotkeyManager()
    {
        try
        {
            RegisterHotKey(IntPtr.Zero, HOTKEY_ID, MOD_CONTROL | MOD_ALT, VK_P);
        }
        catch
        {
            // Ignore hotkey registration failure in headless/test env
        }
    }

    public void TogglePreviewMode()
    {
        IsPreviewOnly = !IsPreviewOnly;
    }

    public void Dispose()
    {
        try
        {
            UnregisterHotKey(IntPtr.Zero, HOTKEY_ID);
        }
        catch
        {
            // Ignore
        }
    }
}
