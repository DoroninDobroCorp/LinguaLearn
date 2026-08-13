using System;
using System.Runtime.InteropServices;
using System.Windows.Interop;

namespace LinguaLearnAgent.Hotkey;

public class PreviewHotkeyManager : IDisposable
{
    public bool IsPreviewOnly { get; set; } = false;

    public const int HOTKEY_ID = 9000;
    public const int WM_HOTKEY = 0x0312;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_ALT = 0x0001;
    private const uint VK_G = 0x47; // Ctrl+Alt+G preview hotkey
    private const uint VK_P = 0x50; // Ctrl+Alt+P fallback hotkey

    private IntPtr _hWnd = IntPtr.Zero;
    private HwndSource? _hwndSource = null;

    public event EventHandler? HotkeyPressed;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public PreviewHotkeyManager()
    {
        // Hotkey registration postponed until valid window handle is registered in RegisterWindowHandle
    }

    public bool RegisterWindowHandle(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero) return false;

        Unregister();

        _hWnd = hWnd;
        _hwndSource = HwndSource.FromHwnd(hWnd);
        if (_hwndSource != null)
        {
            _hwndSource.AddHook(HwndHook);
        }

        // Register Ctrl+Alt+G (or fallback Ctrl+Alt+P if G fails)
        bool registered = RegisterHotKey(_hWnd, HOTKEY_ID, MOD_CONTROL | MOD_ALT, VK_G);
        if (!registered)
        {
            registered = RegisterHotKey(_hWnd, HOTKEY_ID, MOD_CONTROL | MOD_ALT, VK_P);
        }

        return registered;
    }

    private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == HOTKEY_ID)
        {
            OnHotkeyPressed();
            handled = true;
        }
        return IntPtr.Zero;
    }

    public void OnHotkeyPressed()
    {
        IsPreviewOnly = true;
        HotkeyPressed?.Invoke(this, EventArgs.Empty);
    }

    public void TogglePreviewMode()
    {
        IsPreviewOnly = !IsPreviewOnly;
    }

    public void Unregister()
    {
        if (_hwndSource != null)
        {
            try
            {
                _hwndSource.RemoveHook(HwndHook);
            }
            catch { }
            _hwndSource = null;
        }

        if (_hWnd != IntPtr.Zero)
        {
            try
            {
                UnregisterHotKey(_hWnd, HOTKEY_ID);
            }
            catch { }
            _hWnd = IntPtr.Zero;
        }
    }

    public void Dispose()
    {
        Unregister();
    }
}
