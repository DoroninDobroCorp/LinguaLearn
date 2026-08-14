using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace LinguaLearnAgent.UIAutomation;

public class EnterKeyHook : IDisposable
{
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int VK_RETURN = 0x0D;

    public event EventHandler? EnterPressed;

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private LowLevelKeyboardProc? _proc;
    private IntPtr _hookId = IntPtr.Zero;
    private bool _isHooked = false;

    public bool IsHooked => _isHooked;

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT
    {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    public bool Start()
    {
        if (_isHooked) return true;
        try
        {
            if (OperatingSystem.IsWindows())
            {
                _proc = HookCallback;
                using var curProcess = Process.GetCurrentProcess();
                using var curModule = curProcess.MainModule;
                IntPtr modHandle = curModule != null ? GetModuleHandle(curModule.ModuleName) : IntPtr.Zero;
                _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, modHandle, 0);
                _isHooked = _hookId != IntPtr.Zero;
                return _isHooked;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EnterKeyHook] Failed to install keyboard hook: {ex.Message}");
        }
        return false;
    }

    public void Stop()
    {
        if (_isHooked && _hookId != IntPtr.Zero)
        {
            try
            {
                if (OperatingSystem.IsWindows())
                {
                    UnhookWindowsHookEx(_hookId);
                }
            }
            catch { }
            _hookId = IntPtr.Zero;
            _isHooked = false;
        }
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
        {
            try
            {
                var kbData = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
                if (kbData.vkCode == VK_RETURN)
                {
                    // Asynchronously dispatch off the low-level hook thread so NO network or UI Automation work occurs in the hook callback
                    Task.Run(() => OnEnterPressed());
                }
            }
            catch { }
        }
        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    public void OnEnterPressed()
    {
        EnterPressed?.Invoke(this, EventArgs.Empty);
    }

    public void Dispose()
    {
        Stop();
    }
}
