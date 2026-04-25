"""Master list of the 39 individual Tanakh books (the traditional 24 with
Samuel/Kings/Chronicles split, plus Ezra and Nehemiah counted separately,
plus all 12 minor prophets).

Order follows the standard Hebrew Tanakh sequence: Torah, Nevi'im, Ketuvim.
"""

BOOKS = [
    # (english_name, hebrew_name, section, order_idx)
    ("Genesis",        "בראשית",         "Torah",     1),
    ("Exodus",         "שמות",           "Torah",     2),
    ("Leviticus",      "ויקרא",          "Torah",     3),
    ("Numbers",        "במדבר",          "Torah",     4),
    ("Deuteronomy",    "דברים",          "Torah",     5),

    ("Joshua",         "יהושע",          "Prophets",  6),
    ("Judges",         "שופטים",         "Prophets",  7),
    ("I Samuel",       "שמואל א",        "Prophets",  8),
    ("II Samuel",      "שמואל ב",        "Prophets",  9),
    ("I Kings",        "מלכים א",        "Prophets",  10),
    ("II Kings",       "מלכים ב",        "Prophets",  11),
    ("Isaiah",         "ישעיהו",         "Prophets",  12),
    ("Jeremiah",       "ירמיהו",         "Prophets",  13),
    ("Ezekiel",        "יחזקאל",         "Prophets",  14),
    ("Hosea",          "הושע",           "Prophets",  15),
    ("Joel",           "יואל",           "Prophets",  16),
    ("Amos",           "עמוס",           "Prophets",  17),
    ("Obadiah",        "עובדיה",         "Prophets",  18),
    ("Jonah",          "יונה",           "Prophets",  19),
    ("Micah",          "מיכה",           "Prophets",  20),
    ("Nahum",          "נחום",           "Prophets",  21),
    ("Habakkuk",       "חבקוק",          "Prophets",  22),
    ("Zephaniah",      "צפניה",          "Prophets",  23),
    ("Haggai",         "חגי",            "Prophets",  24),
    ("Zechariah",      "זכריה",          "Prophets",  25),
    ("Malachi",        "מלאכי",          "Prophets",  26),

    ("Psalms",         "תהילים",         "Writings",  27),
    ("Proverbs",       "משלי",           "Writings",  28),
    ("Job",            "איוב",           "Writings",  29),
    ("Song of Songs",  "שיר השירים",     "Writings",  30),
    ("Ruth",           "רות",            "Writings",  31),
    ("Lamentations",   "איכה",           "Writings",  32),
    ("Ecclesiastes",   "קהלת",           "Writings",  33),
    ("Esther",         "אסתר",           "Writings",  34),
    ("Daniel",         "דניאל",          "Writings",  35),
    ("Ezra",           "עזרא",           "Writings",  36),
    ("Nehemiah",       "נחמיה",          "Writings",  37),
    ("I Chronicles",   "דברי הימים א",   "Writings",  38),
    ("II Chronicles",  "דברי הימים ב",   "Writings",  39),
]
