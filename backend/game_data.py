from datetime import timedelta
import random
import json
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

reward_punishment_board = {
    "A1": "TW", "A8": "TW", "A15": "TW",
    "B2": "DW", "B6": "TL", "B10": "TL", "B14": "DW",
    "C3": "DW", "C7": "DL", "C9": "DL", "C13": "DW",
    "D1": "DL", "D4": "DW", "D8": "DL", "D12": "DW", "D15": "DL",
    "E5": "DW", "E11": "DW",
    "F2": "TL", "F6": "TL", "F10": "TL", "F14": "TL",
    "G3": "DL", "G7": "DL", "G9": "DL", "G13": "DL",
    "H1": "TW", "H4": "DL", "H8": "★", "H12": "DL", "H15": "TW",
    "I3": "DL", "I7": "DL", "I9": "DL", "I13": "DL",
    "J2": "TL", "J6": "TL", "J10": "TL", "J14": "TL",
    "K5": "DW", "K11": "DW",
    "L1": "DL", "L4": "DW", "L8": "DL", "L12": "DW", "L15": "DL",
    "M3": "DW", "M7": "DL", "M9": "DL", "M13": "DW",
    "N2": "DW", "N6": "TL", "N10": "TL", "N14": "DW",
    "O1": "TW", "O8": "TW", "O15": "TW", "O4": "DL", "O12": "DL"
}

game_board = {}

remaining_letters = {
    "A": {"count": 12, "score": 1},
    "B": {"count": 2, "score": 3},
    "C": {"count": 2, "score": 4},
    "Ç": {"count": 2, "score": 4},
    "D": {"count": 2, "score": 3},
    "E": {"count": 8, "score": 1},
    "F": {"count": 1, "score": 7},
    "G": {"count": 1, "score": 5},
    "Ğ": {"count": 1, "score": 8},
    "H": {"count": 1, "score": 5},
    "I": {"count": 4, "score": 2},
    "İ": {"count": 7, "score": 1},
    "J": {"count": 1, "score": 10},
    "K": {"count": 7, "score": 1},
    "L": {"count": 7, "score": 1},
    "M": {"count": 4, "score": 2},
    "N": {"count": 5, "score": 1},
    "O": {"count": 3, "score": 2},
    "Ö": {"count": 1, "score": 7},
    "P": {"count": 1, "score": 5},
    "R": {"count": 6, "score": 1},
    "S": {"count": 3, "score": 2},
    "Ş": {"count": 2, "score": 4},
    "T": {"count": 5, "score": 1},
    "U": {"count": 3, "score": 2},
    "Ü": {"count": 2, "score": 3},
    "V": {"count": 1, "score": 7},
    "Y": {"count": 2, "score": 3},
    "Z": {"count": 2, "score": 4},
    "Blank": {"count": 2, "score": 0}
}

LETTER_SCORES = {
    "A": 1, "B": 3, "C": 4, "Ç": 4, "D": 3, "E": 1, "F": 7, "G": 5,
    "Ğ": 8, "H": 5, "I": 2, "İ": 1, "J": 10, "K": 1, "L": 1, "M": 2,
    "N": 1, "O": 2, "Ö": 7, "P": 5, "R": 1, "S": 2, "Ş": 4, "T": 1,
    "U": 2, "Ü": 3, "V": 7, "Y": 3, "Z": 4, '*': 0
}


remaining_turn_times = {
    "TWO_MIN": 12,
    "FIVE_MIN": 30,
    "TWELVE_HOUR": 3600,
    "TWENTYFOUR_HOUR": 7200
}

TRAP_SCORE_DIVIDE = "SCORE_DIVIDE"  # Skor Bölme
TRAP_SCORE_TRANSFER = "SCORE_TRANSFER"  # Skor Transferi
TRAP_LETTER_LOSS = "LETTER_LOSS"  # Harf Kaybetme
TRAP_BONUS_BLOCKER = "BONUS_BLOCKER"  # Ekstra Hamle Engeli
TRAP_WORD_CANCEL = "WORD_CANCEL"  # Kelime İptali

REWARD_AREA_BAN = "AREA_BAN"  # Bölge Yasağı
REWARD_LETTER_BAN = "LETTER_BAN"  # Harf Yasağı
REWARD_EXTRA_TURN = "EXTRA_TURN"  # Ekstra Hamle Jokeri

BOARD_SIZE = 15

# Tuzak ve Ödül Sayıları
HIDDEN_ITEM_COUNTS = {
    TRAP_SCORE_DIVIDE: 5,
    TRAP_SCORE_TRANSFER: 4,
    TRAP_LETTER_LOSS: 3,
    TRAP_BONUS_BLOCKER: 2,
    TRAP_WORD_CANCEL: 2,
    REWARD_AREA_BAN: 2,
    REWARD_LETTER_BAN: 3,
    REWARD_EXTRA_TURN: 2,
}


def generate_hidden_board():
    hidden_board = {}
    items_to_place = []
    for item_type, count in HIDDEN_ITEM_COUNTS.items():
        items_to_place.extend([item_type] * count)

    all_coords = [f"{r}_{c}" for r in range(BOARD_SIZE) for c in range(BOARD_SIZE)]

    # Yerleştirilecek öğe sayısı koordinat sayısından fazlaysa hata ver/azalt
    num_items = len(items_to_place)
    if num_items > len(all_coords):
        logger.warning(f"Yerleştirilecek öğe sayısı ({num_items}) koordinat sayısından ({len(all_coords)}) fazla!")
        # Ya hata ver ya da öğeleri azalt
        items_to_place = items_to_place[:len(all_coords)]
        num_items = len(items_to_place)

    # Rastgele koordinatları seç
    selected_coords = random.sample(all_coords, num_items)

    # Öğeleri rastgele koordinatlara ata
    random.shuffle(items_to_place)  # Öğelerin sırasını da karıştır

    for i in range(num_items):
        hidden_board[selected_coords[i]] = items_to_place[i]

    logger.info(f"{len(hidden_board)} adet gizli öğe oluşturuldu.")
    return hidden_board
