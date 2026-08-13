using System;
using Xunit;
using LinguaLearnAgent.Hotkey;

namespace LinguaLearnAgent.Tests;

public class WMHotkeyTests
{
    [Fact]
    public void HotkeyManager_RegistersAndUnregisters_WithoutExceptions()
    {
        using var manager = new PreviewHotkeyManager();
        // Headless registration with IntPtr.Zero returns false gracefully
        bool registered = manager.RegisterWindowHandle(IntPtr.Zero);
        Assert.False(registered);

        manager.Unregister();
    }

    [Fact]
    public void HotkeyPressed_TriggersEventAndSetsPreviewOnly()
    {
        using var manager = new PreviewHotkeyManager();
        bool eventFired = false;

        manager.HotkeyPressed += (sender, args) =>
        {
            eventFired = true;
        };

        manager.OnHotkeyPressed();

        Assert.True(eventFired, "HotkeyPressed event must fire when hotkey is triggered");
        Assert.True(manager.IsPreviewOnly, "IsPreviewOnly must be set to true on hotkey trigger");
    }

    [Fact]
    public void TogglePreviewMode_TogglesState()
    {
        using var manager = new PreviewHotkeyManager();
        Assert.False(manager.IsPreviewOnly);

        manager.TogglePreviewMode();
        Assert.True(manager.IsPreviewOnly);

        manager.TogglePreviewMode();
        Assert.False(manager.IsPreviewOnly);
    }
}
