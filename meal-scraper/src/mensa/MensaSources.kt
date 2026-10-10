package mensa

import kotlinx.serialization.Serializable

@Serializable data class MensaLocation(val id: String, val name: String, val url: String)

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
    )
    val toolHint: String get() = " Known Zürich sources: " + locations.joinToString("; ") { "${it.name}: ${it.url}" }
}
