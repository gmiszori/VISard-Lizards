package mensa

import kotlinx.serialization.Serializable

@Serializable data class MensaLocation(
    val id: String,
    val name: String,
    val url: String,
    val additionalUrls: List<String> = emptyList(),
)

/** Official location pages; menu links are discovered at request time. */
object MensaSources {
    val locations = listOf(
        MensaLocation("seerose", "Cafeteria Seerose", "https://www.zfv.ch/de/essen-gehen/cafeteria-uzh-irchel-seerose"),
        MensaLocation("green-kitchen-lab", "Green Kitchen Lab", "https://www.zfv.ch/de/essen-gehen/uzh-green-kitchen-lab"),
        MensaLocation("irchel-bar", "Irchel Bar", "https://www.zfv.ch/de/essen-gehen/irchel-bar"),
        MensaLocation("mensa-irchel", "Mensa Irchel", "https://www.zfv.ch/de/essen-gehen/mensa-uzh-irchel"),
        MensaLocation("zzm", "Cafeteria Zentrum für Zahnmedizin (ZZM)", "https://www.zfv.ch/de/essen-gehen/cafeteria-zentrum-fuer-zahnmedizin-zzm"),
        MensaLocation("lichthof", "Lichthof", "https://www.zfv.ch/de/essen-gehen/lichthof"),
        MensaLocation("obere-mensa", "Obere Mensa", "https://www.zfv.ch/de/essen-gehen/obere-mensa-uzh"),
        MensaLocation("platte-14", "Platte 14", "https://www.zfv.ch/de/essen-gehen/platte-14"),
        MensaLocation("polysnack", "Polysnack", "https://ethz.ch/de/campus/erleben/gastronomie-und-einkaufen/gastronomie/restaurants-und-cafeterias/zentrum/polysnack.html"),
        MensaLocation("raemi-59", "Rämi 59", "https://www.zfv.ch/de/essen-gehen/raemi-59"),
        MensaLocation("untere-mensa", "Untere Mensa", "https://www.zfv.ch/de/essen-gehen/untere-mensa-uzh"),
        MensaLocation("bistro-tonino", "Bistro Tonino", "https://www.zfv.ch/de/essen-gehen/bistro-tonino"),
        // Lagerstrasse currently lists vending machines; Sihlhof publishes a lunch menu.
        MensaLocation("zhaw-lagerstrasse", "ZHAW Cafeteria Lagerstrasse & Sihlhof", "https://www.zfv.ch/de/essen-gehen/bistro-sihlhof",
            listOf("https://www.zhaw.ch/de/studium/waehrend-des-studiums/verpflegung")),
        MensaLocation("molki", "Mensa Molki", "https://www.zfv.ch/de/essen-gehen/gastronomie-im-toni-areal"),
        MensaLocation("phzh", "Mensa PHZH", "https://www.zfv.ch/de/essen-gehen/mensa-paedagogische-hochschule-zuerich"),
        MensaLocation("botanischer-garten", "Cafeteria Botanischer Garten", "https://www.zfv.ch/de/essen-gehen/cafeteria-uzh-botanischer-garten"),
        MensaLocation("uniturm", "Restaurant UniTurm & Cafeteria Rämi 74", "https://www.zfv.ch/de/essen-gehen/uzh-insieme-raemi74",
            listOf("https://www.zfv.ch/de/essen-gehen/restaurant-uniturm")),
        MensaLocation("the-yard", "The YARD & Cafeteria Brunnenhof", "https://www.zfv.ch/de/essen-gehen/yard",
            listOf("https://www.mensa.uzh.ch/de/Standorte-und-Verpflegung/Brunnenhof.html")),
        MensaLocation("cityport", "Cityport Mensa", "https://www.zfv.ch/de/essen-gehen/cafeteria-uzh-cityport"),
        MensaLocation("bim11", "BIM11", "https://www.zfv.ch/de/essen-gehen/mensa-bim11"),
        // The former HPI restaurant page is gone. This official plan only confirms opening hours.
        MensaLocation("bistro-hpi", "Bistro HPI", "https://ethz.ch/content/dam/ethz/common/images/arealplaene/sonderkarten/ETH_Hoenggerberg_SK_GRO_de_lyt.pdf"),
        MensaLocation("science-lounge", "Science Lounge", "https://www.zfv.ch/de/essen-gehen/eth-zuerich-science-lounge"),
        MensaLocation("zwei-grad", "Zwei Grad Bistro", "https://ethz.ch/de/campus/erleben/gastronomie-und-einkaufen/gastronomie/restaurants-und-cafeterias/zentrum/zwei-grad-bistro.html"),
        MensaLocation("bellavista", "Restaurant Bellavista", "https://www.zfv.ch/de/essen-gehen/restaurant-bellavista"),
    )
    val toolHint: String get() = " Known cafeteria sources: " + locations.joinToString("; ") {
        "${it.name}: ${(listOf(it.url) + it.additionalUrls).joinToString(", ")}"
    } + ". Bistro HPI's campus plan provides opening hours only, not a meal menu. Science Lounge is in Basel."
}
