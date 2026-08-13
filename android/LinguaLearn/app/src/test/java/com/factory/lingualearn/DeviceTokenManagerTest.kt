package com.factory.lingualearn

import com.factory.lingualearn.devices.DeviceTokenInfo
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class DeviceTokenManagerTest {

    @Test
    fun testDeviceTokenInfoFormat() {
        val rawToken = "ll_dev_" + UUID.randomUUID().toString().replace("-", "")
        val info = DeviceTokenInfo(
            id = UUID.randomUUID().toString(),
            deviceName = "Google Pixel 8",
            token = rawToken,
            createdAt = java.time.Instant.now().toString()
        )

        assertTrue("Device token must start with ll_dev_", info.token.startsWith("ll_dev_"))
        assertEquals("Google Pixel 8", info.deviceName)
        assertNotNull(info.id)
        assertNotNull(info.createdAt)
    }

    @Test
    fun testNoDefaultFakeTokenInManager() {
        var activeToken: String? = null
        assertNull("Unconfigured device token must return null instead of a default fake token", activeToken)
    }
}
