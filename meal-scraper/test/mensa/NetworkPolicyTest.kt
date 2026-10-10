package mensa

import kotlin.test.*
import java.net.InetAddress

class NetworkPolicyTest {
    @Test fun rejectsUnsafeUrls() {
        listOf("http://example.com/menu", "https://user:pass@example.com", "https://localhost", "https://127.0.0.1", "https://10.1.1.1", "https://[::1]", "https://example.com:8443").forEach {
            assertFailsWith<IllegalArgumentException>(it) { PublicWebFetcher.validateUrl(it) }
        }
        assertEquals("https://example.com/menu", PublicWebFetcher.validateUrl("https://example.com/menu#page=1"))
    }
    @Test fun rejectsPrivateAndReservedAddresses() {
        listOf("127.0.0.1", "10.1.1.1", "192.168.1.1", "100.64.0.1", "169.254.169.254", "198.18.0.1", "::1", "fc00::1", "2001:db8::1").forEach {
            assertFalse(PublicWebFetcher.isPublicAddress(InetAddress.getByName(it)), it)
        }
        assertTrue(PublicWebFetcher.isPublicAddress(InetAddress.getByName("1.1.1.1")))
    }
    @Test fun robotsLongestRuleAndAllowTie() {
        val rules = RobotsRules("User-agent: *\nDisallow: /private\nAllow: /private/menu\nDisallow: /same\nAllow: /same")
        assertFalse(rules.allows("/private/a")); assertTrue(rules.allows("/private/menu.pdf")); assertTrue(rules.allows("/same"))
    }
    @Test fun robotsSpecificAgentOverridesWildcardAndEmptyDisallowStartsGroup() {
        val rules = RobotsRules("User-agent: *\nDisallow:\nUser-agent: MealScraperMcp\nDisallow: /menu")
        assertFalse(rules.allows("/menu")); assertTrue(rules.allows("/about"))
    }
    @Test fun robotsWildcardAndEndAnchor() {
        val rules = RobotsRules("User-agent: *\nDisallow: /*.pdf$")
        assertFalse(rules.allows("/food/menu.pdf")); assertTrue(rules.allows("/food/menu.pdf?x=1"))
    }
}
