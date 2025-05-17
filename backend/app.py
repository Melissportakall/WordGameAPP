import eventlet

eventlet.monkey_patch()

import os
import json
import random
import time
import copy
import logging
from datetime import datetime, timedelta
from threading import Lock

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import or_, desc
from werkzeug.security import generate_password_hash, check_password_hash
from flask_socketio import SocketIO, join_room, leave_room, emit, disconnect

from models import db, User, Game, GameMode
import game_data

# ARTIK BUNUNLA BAŞLAT
# python app.py

# TERMİNALDE BUNUNLA BAŞLAT
# flask run --host=0.0.0.0 --port=5000

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get('DATABASE_URL', "mysql+pymysql://root@127.0.0.1/yazlab2_2")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

waiting_players = {
    "TWO_MIN": [],
    "FIVE_MIN": [],
    "TWELVE_HOUR": [],
    "TWENTYFOUR_HOUR": []
}

cancel_flags = {}
matched_players = {}
lock = Lock()

logger = logging.getLogger(__name__)

TURKISH_VOWELS = "AEIİOÖUÜ"
REWARD_PUNISHMENT_BOARD = game_data.reward_punishment_board
LETTER_SCORES = {letter: data['score'] for letter, data in game_data.remaining_letters.items()}


@app.route('/register', methods=['POST', 'OPTIONS'])
def register():
    if request.method == 'OPTIONS':
        return jsonify({'message': 'CORS preflight check successful'}), 200

    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"message": "Tüm alanları doldurun"}), 400

    # Kullanıcı adı ve e-posta kontrolü
    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({"message": "Kullanıcı adı zaten mevcut"}), 400

    existing_email = User.query.filter_by(email=email).first()
    if existing_email:
        return jsonify({"message": "E-posta zaten mevcut"}), 400

    # Şifreyi hash'leme
    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')

    # Yeni kullanıcı oluşturma
    new_user = User(username=username, email=email, password=hashed_password)

    try:
        db.session.add(new_user)
        db.session.commit()
        logger.info(f"Yeni kullanıcı kaydedildi: {username}")
        return jsonify({"message": "Kullanıcı başarıyla kaydedildi"}), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Kullanıcı kaydedilirken hata: {e}")
        return jsonify({"message": "Kullanıcı kaydedilirken bir hata oluştu"}), 500


# Giriş fonksiyonu
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    logger.debug(f"Login isteği: {username}")

    if not username or not password:
        return jsonify({"message": "Kullanıcı adı ve şifre gerekli"}), 400

    try:
        # Kullanıcı adına göre kullanıcıyı bul
        user = User.query.filter_by(username=username).first()

        # Kullanıcı bulunamadıysa
        if not user:
            logger.warning(f"Kullanıcı bulunamadı: {username}")
            return jsonify({"message": "Kullanıcı bulunamadı"}), 401

        # Şifre kontrolü
        if not check_password_hash(user.password, password):
            logger.warning(f"Geçersiz şifre: {password}")
            return jsonify({"message": "Geçersiz şifre"}), 401

        logger.info(f"Başarılı giriş: {username}")
        return jsonify({"message": "Giriş başarılı", "user_id": user.id}), 200
    except Exception as e:
        logger.error(f"Login sırasında hata: {e}")
        return jsonify({"message": "Giriş sırasında bir hata oluştu"}), 500


@app.route('/find-opponent', methods=['POST'])
def find_opponent():
    remaining_time = None
    data = request.get_json()
    if not data:
        logger.warning("find_opponent: İstek gövdesinde JSON verisi eksik.")
        return jsonify({"message": "JSON verisi eksik"}), 400

    try:
        user_id = int(data.get('user_id'))
        game_duration = data.get('game_duration')
        if not user_id or not game_duration: raise ValueError("Eksik parametre")
    except (TypeError, ValueError, AttributeError) as e:
        logger.warning(f"find_opponent: Geçersiz veya eksik parametre: {e} - Veri: {data}")
        return jsonify({"message": "Geçersiz veya eksik parametre."}), 400

    # Oyun süresine göre bitiş zamanını hesapla
    try:
        match game_duration:
            case "TWO_MIN":
                remaining_time = datetime.utcnow() + timedelta(minutes=2)
            case "FIVE_MIN":
                remaining_time = datetime.utcnow() + timedelta(minutes=5)
            case "TWELVE_HOUR":
                remaining_time = datetime.utcnow() + timedelta(hours=12)
            case "TWENTYFOUR_HOUR":
                remaining_time = datetime.utcnow() + timedelta(hours=24)
            case _:
                logger.warning(f"Geçersiz game_duration: {game_duration}"); return jsonify(
                    {"message": "Geçersiz oyun süresi."}), 400
    except NameError:
        logger.error("datetime veya timedelta import edilmemiş!")
        return jsonify({"message": "Sunucu yapılandırma hatası."}), 500
    except Exception as e:
        logger.error(f"Zaman hesaplama hatası: {e}")
        return jsonify({"message": "Oyun süresi işlenirken hata."}), 500

    if game_duration not in waiting_players:
        logger.warning(f"Desteklenmeyen game_duration alındı: {game_duration}")
        return jsonify({"message": f"Geçersiz oyun süresi belirtildi: {game_duration}"}), 400

    # Kullanıcıyı kuyruğa ekle
    with lock:
        if user_id not in waiting_players[game_duration]:
            waiting_players[game_duration].append(user_id)
            logger.info(f"Kullanıcı {user_id}, {game_duration} kuyruğuna eklendi.")
        else:
            # Kullanıcı zaten kuyruktaysa, belki mevcut arama isteğini sonlandırıp yeni timeout başlatmak gerekir?
            # Şimdilik sadece logluyoruz. Dikkat: Bu durum client'ta çift arama isteğine neden olabilir.
            logger.info(f"Kullanıcı {user_id} zaten {game_duration} kuyruğunda bekliyor.")
        cancel_flags[user_id] = False  # Her yeni aramada iptal bayrağını sıfırla

    timeout_seconds = 15  # Rakip arama süresi
    start_time = time.time()

    try:
        while time.time() < start_time + timeout_seconds:
            opponent_id = None
            opponent_index = -1
            my_index = -1
            found_match_in_loop = False

            # 1. Önceden eşleşme kontrolü (Başka bir istek tarafından eşleştirildiyse)
            with lock:
                if user_id in matched_players:
                    game_id, opponent_id = matched_players.pop(user_id)
                    # İptal bayrağını da temizleyelim (artık gereksiz)
                    cancel_flags.pop(user_id, None)
                    logger.info(
                        f"Kullanıcı {user_id} için eşleşme bulundu (önceden eşleşmiş): {opponent_id}, GameID: {game_id}")
                    return jsonify({"opponentFound": True, "game_id": game_id, "opponent_id": opponent_id}), 200

            # 2. Rakip arama ve aktif oyun kontrolü
            with lock:
                # 2a. İptal Kontrolü
                if cancel_flags.get(user_id):
                    logger.info(f"Kullanıcı {user_id} aramayı iptal etti ({game_duration}).")
                    # Kuyruktan güvenli çıkarma
                    try:
                        waiting_players[game_duration].remove(user_id)
                    except ValueError:
                        logger.warning(f"İptal eden kullanıcı {user_id} kuyrukta bulunamadı.")
                    cancel_flags.pop(user_id, None)
                    return jsonify({"opponentFound": False, "cancelled": True}), 200

                current_queue = waiting_players[game_duration]
                # Kendi index'imizi bulalım (her döngüde tekrar bulmak gerekebilir, liste değişmiş olabilir)
                try:
                    my_index = current_queue.index(user_id)
                except ValueError:
                    # Eğer kullanıcı listeden çıkarıldıysa (başka bir thread eşleştirdi veya iptal ettiyse)
                    logger.warning(f"Kullanıcı {user_id} döngü içinde kuyrukta bulunamadı.")
                    break  # While döngüsünden çık, timeout'a gitsin veya matched_players ile yakalanır

                # 2b. Kuyruktaki Diğerlerini Kontrol Et
                for i, potential_opponent_id in enumerate(current_queue):
                    # Kendimiz değilse ve iptal etmemişse
                    if i != my_index and not cancel_flags.get(potential_opponent_id):
                        logger.debug(
                            f"{user_id} potansiyel rakip buldu: {potential_opponent_id}. Aktif oyun kontrol ediliyor...")

                        # --- Aktif Oyun Sorgusu ---
                        existing_active_game = Game.query.filter(
                            or_(
                                (Game.user1 == user_id) & (Game.user2 == potential_opponent_id),
                                (Game.user1 == potential_opponent_id) & (Game.user2 == user_id)
                            ),
                            Game.status == 'active'
                        ).first()
                        # --- Sorgu Sonu ---

                        if existing_active_game:
                            # Aktif oyun VARSA: Bu rakibi atla, logla ve for döngüsüne devam et
                            logger.info(
                                f"User {user_id} ve {potential_opponent_id} arasında zaten aktif oyun var (ID: {existing_active_game.id}). Rakip atlanıyor.")
                            continue  # Bir sonraki potansiyel rakibe geç
                        else:
                            # Aktif oyun YOKSA: Bu rakiple eşleşebiliriz!
                            opponent_id = potential_opponent_id
                            opponent_index = i
                            found_match_in_loop = True
                            logger.info(f"Aktif oyun yok. {user_id} ile {opponent_id} eşleşti.")
                            break  # Rakip bulundu, for döngüsünden çık
                # --- Rakip Arama For Döngüsü Sonu ---

                # 2c. Eşleşme Bulunduysa Yeni Oyun Oluştur
                if found_match_in_loop:
                    # İki oyuncuyu da kuyruktan güvenli şekilde çıkar
                    try:
                        # Önce yüksek index'i silmek sorun çıkarmaz
                        idx1, idx2 = sorted([my_index, opponent_index], reverse=True)
                        del current_queue[idx1]
                        del current_queue[idx2]
                        logger.info(f"Kullanıcılar {user_id} ve {opponent_id}, {game_duration} kuyruğundan çıkarıldı.")
                    except IndexError:
                        logger.error(
                            f"find_opponent: Kuyruktan silerken Index Hatası! user={user_id}({my_index}), opp={opponent_id}({opponent_index}), queue={current_queue}")
                        continue  # While döngüsünün başına dön, tekrar dene

                    # --- Yeni Oyun Oluşturma ---
                    try:
                        gamemode = GameMode[game_duration.upper()]
                        # Harf dağıtımı (doğru fonksiyonu çağırır ve Python objeleri döner)
                        letter_result = distribute_letters_from_json(game_data.remaining_letters)
                        # Gizli tahta oluştur (doğru fonksiyonu çağırır ve dict döner)
                        hidden_board_dict = game_data.generate_hidden_board()

                        new_game = Game(
                            user1=user_id, user2=opponent_id,
                            reward_punishment_board=game_data.reward_punishment_board,  # Direkt dict
                            game_board={},  # Boş dict
                            hidden_board=hidden_board_dict,  # Direkt dict
                            user1_rewards=[], user2_rewards=[],  # Boş liste
                            score1=0, score2=0, turn_order=user_id,
                            remaining_letters=letter_result["remaining_letters"],  # Direkt dict
                            gamemode=gamemode, created_at=datetime.utcnow(),
                            remaining_time=remaining_time,
                            user1_letters=letter_result["user1_letters"],  # Direkt liste
                            user2_letters=letter_result["user2_letters"],  # Direkt liste
                            status='active'
                        )
                        db.session.add(new_game)
                        db.session.commit()
                        game_id_to_return = new_game.id
                        logger.info(
                            f"Yeni oyun {game_id_to_return} oluşturuldu. User1={user_id}, User2={opponent_id}. İlk sıra: User {new_game.turn_order}")

                        # Eşleşenleri kaydet
                        matched_players[user_id] = (game_id_to_return, opponent_id)
                        matched_players[opponent_id] = (game_id_to_return, user_id)
                        # İptal bayraklarını temizle
                        cancel_flags.pop(user_id, None);
                        cancel_flags.pop(opponent_id, None)

                        # Başarılı yanıtı döndür
                        return jsonify(
                            {"opponentFound": True, "game_id": game_id_to_return, "opponent_id": opponent_id}), 200

                    except KeyError as e:  # GameMode hatası
                        logger.error(f"Geçersiz gamemode key: {game_duration} - {e}");
                        # Oyuncuları geri eklemek yerine direkt hata dönelim, client tekrar dener.
                        return jsonify({"message": "Geçersiz oyun modu."}), 400
                    except Exception as create_err:
                        logger.error(f"Yeni oyun oluşturma sırasında hata: {create_err}", exc_info=True)
                        db.session.rollback()  # Hata olursa rollback yap
                        # Oyuncuları geri eklemek yerine direkt hata dönelim.
                        return jsonify({"message": "Oyun oluşturma hatası."}), 500
                    # --- Yeni Oyun Oluşturma Sonu ---

            # Kilit dışı bekleme (lock bloğu burada biter)
            if not found_match_in_loop:  # Eğer bu turda eşleşme olmadıysa veya tüm rakipler atlandıysa
                time.sleep(1)  # 1 saniye bekle ve while döngüsüne devam et
            # else: Eşleşme oldu ve return yapıldıysa burası çalışmaz.

        # --- While Döngüsü Bitti (Timeout) ---
        logger.info(f"{user_id} için timeout (find_opponent).")
        with lock:  # Kuyruktan ve bayraktan temizle
            if user_id in waiting_players[game_duration]:
                try:
                    waiting_players[game_duration].remove(user_id)
                except ValueError:
                    pass
            cancel_flags.pop(user_id, None)
        return jsonify({"opponentFound": False, "timeout": True}), 200

    # --- Genel Hata Yakalama ---
    except Exception as e:
        logger.error(f"find_opponent içinde beklenmedik genel hata: {e}", exc_info=True)
        # Hata durumunda kullanıcıyı kuyruktan/bayraktan temizlemeyi dene
        with lock:
            if game_duration in waiting_players and user_id in waiting_players[game_duration]:
                try:
                    waiting_players[game_duration].remove(user_id)
                except ValueError:
                    pass
            cancel_flags.pop(user_id, None)
        return jsonify({"message": "Rakip aranırken sunucu hatası oluştu."}), 500


@app.route('/cancel-find-opponent', methods=['POST'])
def cancel_find_opponent():
    data = request.get_json()
    user_id = data.get('user_id')

    with lock:
        cancel_flags[user_id] = True

    return jsonify({"cancelled": True}), 200


@app.route('/user/<int:user_id>', methods=['GET'])
def get_username(user_id):
    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({"message": "Kullanıcı bulunamadı"}), 404
    return jsonify({"username": user.username}), 200


def draw_letters(remaining_pool, num=7):
    flat_pool = []
    drawn_letters = set()  # Çekilen harfleri tutmak için bir set kullanıyoruz

    # Torbayı oluştur
    for letter, info in remaining_pool.items():
        flat_pool.extend([letter] * info['count'])

    random.shuffle(flat_pool)

    drawn = []
    for _ in range(num):
        while flat_pool:
            letter = flat_pool.pop()
            if letter not in drawn_letters:  # Eğer harf daha önce çekilmediyse
                drawn.append(letter)
                drawn_letters.add(letter)  # Çekilen harfi ekle
                remaining_pool[letter]["count"] -= 1  # Harfin sayısını azalt
                break

    return drawn


@app.route('/game/<int:game_id>/initialize', methods=['GET'])
def initialize_game(game_id):
    logger.info(f"initialize_game endpointine istek alındı. game_id: {game_id}")
    game = db.session.query(Game).filter_by(id=game_id).first()
    if not game:
        return jsonify({"error": "Oyun bulunamadı."}), 500

    updated = False
    current_remaining = copy.deepcopy(game_data.remaining_letters)

    logger.info(f"game initialize girdik")

    # Eğer kullanıcı harfleri boşsa dağıtım yap
    if not game.user1_letters or not isinstance(game.user1_letters, list):
        game.user1_letters = draw_letters(current_remaining, num=7)
        updated = True

    if not game.user2_letters or not isinstance(game.user2_letters, list):
        game.user2_letters = draw_letters(current_remaining, num=7)
        updated = True

    if updated:
        game.remaining_letters = current_remaining
        db.session.commit()

    return jsonify({
        "id": game.id,
        "user1": game.user1,
        "user2": game.user2,
        "reward_punishment_board": game.reward_punishment_board,
        "game_board": game.game_board,
        "score1": game.score1,
        "score2": game.score2,
        "turn_order": game.turn_order,
        "remaining_letters": game.remaining_letters,
        "gamemode": game.gamemode.name if game.gamemode else None,
        "created_at": game.created_at.isoformat() if game.created_at else None,
        "remaining_time": game.remaining_time.isoformat() if game.remaining_time else None,
        "status": game.status,
        "user1_letters": game.user1_letters,
        "user2_letters": game.user2_letters,
    })


@app.route('/submit-move', methods=['POST'])
def submit_move_secure():
    """
    Hamleyi alır, sunucuda DOĞRULAR, skoru HESAPLAR, tuzak/ödül etkilerini
    uygular, durumu günceller ve sonucu döndürür/yayınlar.
    """
    logger.info("Güvenli hamle gönderme isteği alındı.")
    data = request.get_json()
    if not data:
        logger.warning("submit_move: İstek gövdesinde JSON verisi eksik.")
        return jsonify({"message": "JSON verisi eksik"}), 400

    try:
        game_id = int(data.get('game_id'))
        user_id = int(data.get('user_id'))
        placed_tiles = data.get('placed_tiles')  # Client sadece nereye ne koyduğunu gönderir
    except (TypeError, ValueError, AttributeError) as e:
        logger.warning(f"submit_move: Gelen veride format/tip hatası: {e} - Veri: {data}")
        return jsonify({"message": "Geçersiz veri formatı."}), 400

    if not game_id or not user_id or not placed_tiles or not isinstance(placed_tiles, list) or len(placed_tiles) == 0:
        logger.warning(
            f"submit_move: Eksik veya geçersiz parametreler. GameID: {game_id}, UserID: {user_id}, Tiles: {placed_tiles}")
        return jsonify({"message": "Eksik veya geçersiz parametre."}), 400

    logger.debug(f"Gelen Hamle (Doğrulanacak): Game={game_id}, User={user_id}, Tiles={len(placed_tiles)}")

    try:
        # Oyunu Veritabanından Çek ve Kilitle
        game = db.session.query(Game).filter_by(id=game_id).with_for_update().first()

        # 1. Oyun Var mı Kontrolü
        if not game:
            logger.warning(f"submit_move: Oyun bulunamadı ID={game_id}")
            return jsonify({"message": "Oyun bulunamadı"}), 404

        # 2. Yetki Kontrolleri
        if user_id != game.user1 and user_id != game.user2:
            logger.warning(f"submit_move: Kullanıcı {user_id} oyunun ({game_id}) parçası değil.")
            return jsonify({"message": "Bu oyunun oyuncusu değilsiniz"}), 403
        if game.turn_order != user_id:
            logger.warning(f"submit_move: Sıra oyuncuda ({user_id}) değil, sıra {game.turn_order}. Game ID: {game_id}")
            return jsonify({"message": "Sıra sizde değil"}), 403
        if game.status != 'active':
            logger.warning(f"submit_move: Aktif olmayan oyuna ({game_id}, status={game.status}) hamle gönderildi.")
            return jsonify({"message": "Oyun aktif değil."}), 400

        # 3. Minimal El Kontrolü (DB'ye Göre - Düzeltilmiş)
        current_hand = game.user1_letters if user_id == game.user1 else game.user2_letters
        if not isinstance(current_hand, list): current_hand = []
        temp_hand = list(current_hand)
        can_play_tiles = True
        played_letters_from_hand = []  # Gerçekte elden çıkanlar ('Blank' veya harf)
        missing_letter_for_error = ""

        for tile in placed_tiles:
            is_blank_tile = tile.get('is_blank', False)
            played_letter_value = tile.get('letter', '').upper()  # Client'ın seçtiği harf

            # DÜZELTME: Elde ne aranacağını belirle
            # Eğer blank ise DB'deki gibi "Blank" string'ini ara, değilse harfi ara
            letter_to_find_in_hand = "Blank" if is_blank_tile else played_letter_value

            if not tile.get('letter') or not letter_to_find_in_hand:  # Gelen veriyi kontrol et
                can_play_tiles = False;
                logger.warning(f"submit_move: Geçersiz harf verisi: {tile}");
                missing_letter_for_error = "?";
                break

            found_index = -1
            # Geçici elde doğru şeyi ara ("Blank" veya harf)
            for i, hand_letter in enumerate(temp_hand):
                if hand_letter == letter_to_find_in_hand:
                    found_index = i;
                    break

            if found_index != -1:
                # Bulunan harfi/blank'ı geçici elden çıkar ve kaydet
                played_letter = temp_hand.pop(found_index)  # 'Blank' veya 'A' gibi
                played_letters_from_hand.append(played_letter)  # Çıkarılanı listeye ekle
                logger.debug(f"submit_move: Harf/Blank '{played_letter}' elde bulundu ve geçici olarak çıkarıldı.")
            else:
                # Harf/Blank elde bulunamadı
                can_play_tiles = False
                missing_letter_for_error = letter_to_find_in_hand  # Hata mesajı için doğru karakter
                logger.error(
                    f"submit_move: Elde olmayan harf ('{missing_letter_for_error}') oynanmaya çalışıldı. User: {user_id}, Hand(DB): {current_hand}")
                break

        if not can_play_tiles:
            return jsonify({"message": f"Elinde olmayan harf var ('{missing_letter_for_error}')."}), 400
        # --- El Kontrolü Başarılı ---
        logger.debug(f"submit_move: El kontrolü başarılı. Elden çıkanlar: {played_letters_from_hand}")

        # 4. Sunucu Tarafı Hamle Doğrulama (Kelime ve Yerleştirme)
        committed_board = game.game_board or {}  # Zaten dict (db.JSON)
        # !!! GERÇEK DOĞRULAMA FONKSİYONU ÇAĞRILMALI !!!
        # validation_result = checkWordPlacement_server(placed_tiles, committed_board, turkish_words_set_server)
        # Placeholder Kullanımı (MUTLAKA GERÇEK IMPLEMENTASYONLA DEĞİŞTİRİN):
        logger.warning(
            f"Game {game_id}: Sunucu tarafı kelime/yerleştirme doğrulaması atlanıyor (placeholder kullanılıyor)!")
        validation_result = PlacementValidationResult(status=ValidationStatus.Ok, message="OK (Placeholder)",
                                                      validWords=[
                                                          {"word": "".join(t['letter'] for t in placed_tiles) or "TEST",
                                                           "path": [{'row': t['row'], 'col': t['col']} for t in
                                                                    placed_tiles]}])

        if validation_result.status != ValidationStatus.Ok:
            logger.warning(
                f"Geçersiz hamle ({validation_result.status}): {validation_result.message}. Game: {game_id}, User: {user_id}")
            return jsonify({"message": f"Geçersiz hamle: {validation_result.message}"}), 400

        # Sunucunun doğruladığı kelimeler
        valid_words: list[FoundWord] = validation_result.validWords or []
        logger.info(f"Sunucu doğruladı. Geçerli kelimeler: {[w['word'] for w in valid_words]}")
        # --- Doğrulama Bitti ---

        # 5. Gizli Öğeleri Kontrol Et ve Etkileri Belirle
        hidden_items = game.hidden_board or {}
        my_rewards_list = (game.user1_rewards if user_id == game.user1 else game.user2_rewards) or []
        if not isinstance(my_rewards_list, list): my_rewards_list = []  # Güvenlik

        triggered_traps_info = []
        earned_rewards_info = []
        triggered_keys_to_remove = []
        score_modifier = 1.0;
        transfer_score = False;
        cancel_word = False
        block_bonuses = False;
        discard_hand = False;
        grant_extra_turn = False

        for tile in placed_tiles:
            tile_key = f"{tile['row']}_{tile['col']}"
            if tile_key in hidden_items:
                item_type = hidden_items[tile_key]
                logger.info(
                    f"Gizli öğe tetiklendi! Game: {game_id}, User: {user_id}, Key: {tile_key}, Type: {item_type}")
                triggered_keys_to_remove.append(tile_key)

                if item_type == game_data.TRAP_SCORE_DIVIDE:
                    score_modifier = 0.3;
                    triggered_traps_info.append(
                        {"type": item_type, "message": "Puan %70 azaldı!"})
                elif item_type == game_data.TRAP_SCORE_TRANSFER:
                    transfer_score = True;
                    triggered_traps_info.append(
                        {"type": item_type, "message": "Puan rakibe transfer edildi!"})
                elif item_type == game_data.TRAP_LETTER_LOSS:
                    discard_hand = True;
                    triggered_traps_info.append(
                        {"type": item_type, "message": "Eldeki harfler değişiyor!"})
                elif item_type == game_data.TRAP_BONUS_BLOCKER:
                    block_bonuses = True;
                    triggered_traps_info.append(
                        {"type": item_type, "message": "Bonus kareler etkisiz!"})
                elif item_type == game_data.TRAP_WORD_CANCEL:
                    cancel_word = True;
                    triggered_traps_info.append(
                        {"type": item_type, "message": "Kelime puanı iptal edildi!"})
                elif item_type == game_data.REWARD_AREA_BAN:
                    my_rewards_list.append(game_data.REWARD_AREA_BAN);
                    earned_rewards_info.append(
                        {"type": item_type, "message": "Bölge Yasaklama Jokeri kazandın!"})
                elif item_type == game_data.REWARD_LETTER_BAN:
                    my_rewards_list.append(game_data.REWARD_LETTER_BAN);
                    earned_rewards_info.append(
                        {"type": item_type, "message": "Harf Yasaklama Jokeri kazandın!"})
                elif item_type == game_data.REWARD_EXTRA_TURN:
                    my_rewards_list.append(game_data.REWARD_EXTRA_TURN);
                    earned_rewards_info.append(
                        {"type": item_type, "message": "Ekstra Hamle Jokeri kazandın!"})

        # Tetiklenen öğeleri kaldır
        if triggered_keys_to_remove:
            new_hidden_items = hidden_items.copy()
            for key in triggered_keys_to_remove:
                if key in new_hidden_items: del new_hidden_items[key]
            game.hidden_board = new_hidden_items  # Direkt dict ata
            logger.debug(f"Game {game_id}: Gizli tahta güncellendi.")
        # --- Gizli Öğeler Bitti ---

        # --- 6. Sunucu Tarafı Skor Hesaplama ---
        final_score_gain = 0
        final_score_gain = 0
        if cancel_word:
            logger.info(f"Game {game_id}: Kelime iptal edildi. Skor: 0")
            final_score_gain = 0
        else:
            letter_scores_map = {letter: data['score'] for letter, data in (game.remaining_letters or {}).items()}
            if '*' not in letter_scores_map: letter_scores_map['*'] = 0  # Blank puanını ekle (varsa)

            # !!! GERÇEK SKORLAMA FONKSİYONU ÇAĞRILMALI !!!
            # Bu fonksiyon gelen placed_tiles içindeki is_blank:true durumunu dikkate alarak puanı 0 hesaplamalı.
            server_calculated_score = calculate_score_server_side(
                valid_words, placed_tiles, game.reward_punishment_board or {}, letter_scores_map, block_bonuses
            )

            if block_bonuses: logger.info(f"Game {game_id}: Bonuslar bloklandı (Gerçek skor hesaplaması TODO)")
            final_score_gain = round(server_calculated_score * score_modifier)
            logger.info(f"Game {game_id}: Final Skor Kazancı Hesaplandı (Placeholder): {final_score_gain}")

        # --- Skor Hesaplama Bitti ---

        # --- 7. Veritabanı Güncellemeleri (Sıralı) ---

        # 7a. Skorları Güncelle
        if transfer_score:
            if user_id == game.user1:
                game.score2 += final_score_gain
            else:
                game.score1 += final_score_gain
            logger.info(
                f"Game {game_id}: Skor ({final_score_gain}) rakibe transfer edildi. Yeni skorlar: User1={game.score1}, User2={game.score2}")
        else:
            if user_id == game.user1:
                game.score1 += final_score_gain
            else:
                game.score2 += final_score_gain
            logger.info(
                f"Game {game_id}: Skor güncellendi. Oyuncu {user_id} +{final_score_gain} puan. Yeni skorlar: User1={game.score1}, User2={game.score2}")

        # 7b. Kazanılan/Kullanılan Ödülleri Kaydet
        #   Ekstra hamle kullanıldıysa listeden çıkarılması aşağıda sıra değiştirme kısmında yapılıyor.
        if user_id == game.user1:
            game.user1_rewards = my_rewards_list  # Zaten güncel liste
        else:
            game.user2_rewards = my_rewards_list
        logger.debug(f"Game {game_id}: Ödüller güncellendi: {my_rewards_list}")

        # --- Kalan Harfleri Güncelleme (played_letters_from_hand Kullanımı) ---
        # Bu bölüm artık doğru çalışmalı çünkü played_letters_from_hand 'Blank' veya harf içeriyor
        remaining_letters_dict = game.remaining_letters or {}
        temp_remaining_letters = json.loads(json.dumps(remaining_letters_dict))  # Derin kopya al
        for letter_key in played_letters_from_hand:  # 'Blank' veya 'A' gibi
            if letter_key in temp_remaining_letters:
                temp_remaining_letters[letter_key]['count'] = max(0, temp_remaining_letters[letter_key]['count'] - 1)
            else:
                logger.warning(f"Kalan harfler güncellenirken {letter_key} bulunamadı!")
        final_remaining_letters_dict = temp_remaining_letters  # Bu, draw_new_letters'a gidecek
        logger.debug(f"Game {game_id}: Kalan harfler oynananlara göre azaltıldı.")
        # --- Kalan Harfler Güncellendi ---

        # --- Eli Güncelle (Oynananları Çıkar) ---
        updated_hand_before_draw = list(current_hand)
        for played_letter in played_letters_from_hand:  # 'Blank' veya 'A' gibi
            try:
                updated_hand_before_draw.remove(played_letter)
            except ValueError:
                logger.error(f"Game {game_id}: Elden {played_letter} silinirken hata?")
        logger.debug(f"El güncellendi (Çekmeden Önce): {updated_hand_before_draw}")
        # --- El Güncelleme Bitti ---

        # 7e. Yeni Harf Çek (Azaltılmış Havuzdan)
        num_to_draw = 7 if discard_hand else len(placed_tiles)
        if discard_hand: updated_hand_before_draw = []

        # draw_new_letters güncellenmiş havuzu (final_remaining_letters_dict) kullanmalı
        new_player_hand, final_remaining_letters_dict_after_draw = draw_new_letters(
            final_remaining_letters_dict,  # Azaltılmış havuzu ver
            updated_hand_before_draw,
            num_to_draw
        )

        # Güncel eli ve ÇEKİM SONRASI kalan harfleri kaydet
        if user_id == game.user1:
            game.user1_letters = new_player_hand
        else:
            game.user2_letters = new_player_hand
        game.remaining_letters = final_remaining_letters_dict_after_draw  # Çekim sonrası son hali
        logger.debug(f"Game {game_id}: Yeni harfler çekildi. Güncel el: {new_player_hand}")

        # 7f. Tahtayı Güncelle
        committed_board = game.game_board or {}  # En güncel halini al (başka bir güncelleme olmamıştır varsayımı)
        new_game_board = committed_board.copy()
        for tile in placed_tiles: new_game_board[f"{tile['row']}_{tile['col']}"] = tile['letter']
        game.game_board = new_game_board
        logger.debug(f"Game {game_id}: Tahta güncellendi.")

        # 7g. Sırayı Değiştir (Ekstra Hamle kontrolü dahil)
        next_turn_user_id = game.user2 if game.user1 == user_id else game.user1
        if game_data.REWARD_EXTRA_TURN in my_rewards_list:
            logger.info(f"Game {game_id}: Oyuncu {user_id} Ekstra Hamle jokeri kullandı.")
            grant_extra_turn = True  # WebSocket ve yanıt için işaretle
            my_rewards_list.remove(game_data.REWARD_EXTRA_TURN)  # Jokeri harca
            next_turn_user_id = user_id  # Sıra kendisinde kalsın
            # Güncellenmiş ödül listesini tekrar DB'ye yaz
            if user_id == game.user1:
                game.user1_rewards = my_rewards_list
            else:
                game.user2_rewards = my_rewards_list
            logger.debug(f"Game {game_id}: Ekstra hamle sonrası ödüller: {my_rewards_list}")
        game.turn_order = next_turn_user_id
        logger.info(f"Game {game_id}: Sıra {next_turn_user_id} oyuncusuna geçti.")

        # 7h. TODO: Oyun Bitiş Kontrolü (Burada yapılabilir)
        #   Örn: if not game.remaining_letters or len(parse_db_json(game.remaining_letters, default={})) == 0: ...
        #   Örn: if pas_sayisi >= 2: ...

        # 8. Değişiklikleri Veritabanına İşle
        db.session.commit()
        logger.info(f"Oyun {game_id} veritabanına başarıyla kaydedildi.")
        # --- Veritabanı Güncelleme Sonu ---

        # --- 9. WebSocket ile Güncelleme Gönder ---
        try:
            # Güncel durumu hazırla
            updated_game_state = {
                "id": game.id, "user1": game.user1, "user2": game.user2,
                "reward_punishment_board": game.reward_punishment_board or {},
                "game_board": game.game_board or {},
                "score1": game.score1, "score2": game.score2,
                "turn_order": game.turn_order,
                "remaining_letters": game.remaining_letters or {},
                "gamemode": game.gamemode.name if game.gamemode else None,
                "created_at": game.created_at.isoformat() if game.created_at else None,
                "remaining_time": game.remaining_time.isoformat() if game.remaining_time else None,
                "status": game.status,
                "user1_letters": game.user1_letters or [],
                "user2_letters": game.user2_letters or [],
                "user1_rewards": game.user1_rewards or [],
                "user2_rewards": game.user2_rewards or [],
                "last_move_info": {
                    "player_id": user_id, "placed_tiles": placed_tiles,
                    "score_gained": final_score_gain if not transfer_score else 0,
                    "opponent_score_gained": final_score_gain if transfer_score else 0,
                    "triggered_traps": triggered_traps_info,
                    "earned_rewards": earned_rewards_info,
                    "extra_turn_used": grant_extra_turn,
                    "hand_discarded": discard_hand
                }
            }
            room_id = str(game.id)
            socketio.emit('game_updated', updated_game_state, to=room_id)
            logger.info(f"'{room_id}' odasına 'game_updated' olayı gönderildi.")
        except Exception as socket_err:
            logger.error(f"SocketIO emit hatası: {socket_err}", exc_info=True)

        # --- 10. HTTP Yanıtı ---
        return jsonify({
            "message": "Hamle başarılı",
            "new_score1": game.score1,  # Güncel skorları döndür
            "new_score2": game.score2,
            "next_turn": game.turn_order,  # Sıranın kime geçtiğini döndür
            "game_board": game.game_board or {},  # Güncel tahtayı döndür
            "new_player_letters": new_player_hand,  # Hamleyi yapanın yeni harflerini döndür
            # Client'ın anında geri bildirim alması için bu bilgileri de ekleyelim:
            "triggered_traps": triggered_traps_info,
            "earned_rewards": earned_rewards_info
        }), 200

    except Exception as e:
        db.session.rollback();
        logger.error(f"submit_move sırasında beklenmedik hata: {e}", exc_info=True)
        return jsonify({"message": "Hamle işlenirken sunucu hatası."}), 500


@app.route('/active-games/<int:user_id>', methods=['GET'])
def get_active_games(user_id):
    try:
        # Kullanıcının aktif oyunlarını sorgula
        active_games = Game.query.filter(
            ((Game.user1 == user_id) | (Game.user2 == user_id)) & (Game.status == 'active')
        ).all()

        if not active_games:
            return Response("No active games found", status=200)

        # Aktif oyunları düz bir metin formatında döndür
        active_games_data = []
        for game in active_games:
            active_games_data.append(
                f"Game ID: {game.id}, Opponent: {game.user2 if game.user1 == user_id else game.user1}, Remaining Time: {game.remaining_time}, Gamemode: {game.gamemode}")

        return Response("\n".join(active_games_data), status=200)
    except Exception as e:
        logger.error(f"Active games sorgusu sırasında hata: {e}", exc_info=True)
        return Response("Error occurred while fetching active games", status=500)


@app.route('/leave-game/<int:game_id>', methods=['POST'])
def leave_game(game_id):
    # Pes eden kullanıcının ID'sini request body'sinden al
    data = request.get_json()
    if not data or 'userId' not in data: # Frontend'in 'userId' gönderdiğini varsayıyoruz
        logger.warning(f"leave_game: İstek gövdesinde userId eksik. Game ID: {game_id}")
        return jsonify({"error": "Kullanıcı ID gerekli."}), 400

    try:
        resigning_user_id = int(data.get('userId'))
    except (ValueError, TypeError):
         logger.warning(f"leave_game: Geçersiz userId formatı. Game ID: {game_id}, Gelen: {data.get('userId')}")
         return jsonify({"error": "Geçersiz Kullanıcı ID formatı."}), 400

    logger.info(f"Kullanıcı {resigning_user_id}, oyun {game_id}'den ayrılma/pes etme isteği gönderdi.")

    try:
        # Oyunu bul ve kilitle (opsiyonel ama güvenli)
        game = db.session.query(Game).filter_by(id=game_id).with_for_update().first()

        if not game:
            logger.warning(f"leave_game: Oyun bulunamadı. Game ID: {game_id}")
            return jsonify({"error": "Oyun bulunamadı."}), 404

        # İstek yapan kullanıcının oyunda olduğunu doğrula
        if resigning_user_id != game.user1 and resigning_user_id != game.user2:
            logger.warning(f"leave_game: Kullanıcı {resigning_user_id} oyunun ({game_id}) parçası değil.")
            return jsonify({"error": "Bu oyundan ayrılma yetkiniz yok."}), 403

        # Oyun zaten bitmişse veya pasifse işlem yapma (isteğe bağlı)
        if game.status != 'active':
            logger.info(f"leave_game: Oyun {game_id} zaten aktif değil (Status: {game.status}).")
            # Belki mevcut durumu döndürmek yeterli olabilir
            return jsonify({"message": f"Oyun zaten {game.status} durumda."}), 200 # Hata vermek yerine bilgi ver

        # Kazananı belirle (pes etmeyen diğer oyuncu)
        winner_id = game.user2 if game.user1 == resigning_user_id else game.user1
        logger.info(f"Game {game_id}: Kazanan {winner_id} olarak belirlendi (User {resigning_user_id} pes etti).")

        # Oyunun durumunu ve kazananı güncelle
        game.status = 'finished' # 'passive' yerine 'finished' daha anlamlı olabilir
        game.winner = winner_id  # Yeni eklenen winner sütununu set et

        db.session.commit() # Değişiklikleri kaydet
        logger.info(f"Game {game_id} durumu '{game.status}' ve kazanan {game.winner} olarak güncellendi.")

        # --- WebSocket ile Diğer Oyuncuya Bildirim (Önerilir) ---
        try:
            # Oyunun son durumunu hazırla (initialize gibi)
            final_game_state = {
                 "id": game.id, "user1": game.user1, "user2": game.user2,
                 "reward_punishment_board": game.reward_punishment_board or {},
                 "game_board": game.game_board or {},
                 "score1": game.score1, "score2": game.score2,
                 "turn_order": game.turn_order, # Sıra önemsizleşti ama gönderilebilir
                 "remaining_letters": game.remaining_letters or {},
                 "gamemode": game.gamemode.name if game.gamemode else None,
                 "created_at": game.created_at.isoformat() if game.created_at else None,
                 "remaining_time": game.remaining_time.isoformat() if game.remaining_time else None,
                 "status" : game.status, # 'finished' olacak
                 "winner_id": game.winner, # Kazanan ID'si eklendi
                 "user1_letters": game.user1_letters or [],
                 "user2_letters": game.user2_letters or [],
                 "user1_rewards": game.user1_rewards or [],
                 "user2_rewards": game.user2_rewards or [],
                 "last_move_info": { # Özel bir olay tipi de tanımlanabilir
                     "type": "resign",
                     "player_id": resigning_user_id,
                     "winner_id": winner_id
                 }
            }
            room_id = str(game.id)
            # Odaya oyunun bittiğini ve kazananı bildir
            # 'game_updated' yerine 'game_over' gibi özel bir event daha iyi olabilir
            socketio.emit('game_updated', final_game_state, to=room_id)
            # veya socketio.emit('game_over', final_game_state, to=room_id)
            logger.info(f"'{room_id}' odasına oyunun bittiği bilgisi gönderildi.")
        except Exception as socket_err:
            logger.error(f"SocketIO emit (leave_game) hatası: {socket_err}", exc_info=True)
        # --- WebSocket Bildirimi Sonu ---


        # Başarılı yanıtı döndür
        return jsonify({"message": "Oyundan başarıyla ayrıldınız, rakibiniz kazandı."}), 200

    except Exception as e:
        db.session.rollback() # Hata olursa geri al
        logger.error(f"Oyundan çıkış sırasında genel hata: {e}", exc_info=True)
        return jsonify({"error": "Oyundan çıkış sırasında bir sunucu hatası oluştu."}), 500

@app.route('/completed-games/<int:user_id>', methods=['GET'])
def get_completed_games(user_id):
    logger.info(f"Kullanıcı {user_id} için biten oyunlar isteniyor.")
    try:
        # Kullanıcının varlığını kontrol et (opsiyonel ama iyi pratik)
        user = db.session.query(User).filter_by(id=user_id).first()
        if not user:
             logger.warning(f"get_completed_games: Kullanıcı bulunamadı: {user_id}")
             return jsonify({"error": "Kullanıcı bulunamadı."}), 404

        # Oyunları sorgula: Kullanıcı user1 VEYA user2 olacak VE status 'active' OLMAYACAK
        # Son biten oyunlar en üstte olsun diye created_at'e göre tersten sırala
        completed_games_query = Game.query.filter(
            or_(Game.user1 == user_id, Game.user2 == user_id),
            Game.status != 'active' # 'finished', 'passive', 'resigned' vb. durumları kapsar
        ).order_by(desc(Game.created_at)).all()

        results = []
        for game in completed_games_query:
            # Rakip ID ve skoru belirle
            opponent_id = None
            user_score = 0
            opponent_score = 0
            if game.user1 == user_id:
                opponent_id = game.user2
                user_score = game.score1
                opponent_score = game.score2
            else:
                opponent_id = game.user1
                user_score = game.score2
                opponent_score = game.score1

            # Rakip kullanıcı adını bul
            opponent_username = "Bilinmeyen Rakip"
            if opponent_id:
                opponent_user = db.session.query(User).filter_by(id=opponent_id).first()
                if opponent_user:
                    opponent_username = opponent_user.username

            # Sonucu belirle (önce winner alanına bak, sonra skorlara)
            result = 'draw' # Varsayılan
            if game.winner is not None: # Eğer kazanan belirlenmişse (örn: pes etme)
                if game.winner == user_id:
                    result = 'win'
                else:
                    result = 'lose'
            else: # Kazanan belirlenmemişse skorları karşılaştır
                if user_score > opponent_score:
                    result = 'win'
                elif user_score < opponent_score:
                    result = 'lose'
                # Eşitse 'draw' kalır

            results.append({
                "id": game.id, # Oyun ID'si
                "opponentName": opponent_username,
                "userScore": user_score,
                "opponentScore": opponent_score,
                "result": result, # 'win', 'lose', veya 'draw'
                "date": game.created_at.strftime('%Y-%m-%d %H:%M') if game.created_at else None # Opsiyonel: Tarih
            })

        logger.info(f"Kullanıcı {user_id} için {len(results)} biten oyun bulundu.")
        return jsonify(results), 200

    except Exception as e:
        logger.error(f"Biten oyunlar alınırken hata: {e}", exc_info=True)
        return jsonify({"error": "Biten oyunlar alınırken sunucu hatası oluştu."}), 500


@app.route('/resume-game/<int:game_id>', methods=['GET'])
def resume_game(game_id):
    try:
        game = Game.query.filter_by(id=game_id, status='active').first()
        if not game:
            return jsonify({"error": "Oyun bulunamadı veya aktif değil."}), 404

        # Oyunun mevcut durumunu döndür
        return jsonify({
            "id": game.id,
            "user1": game.user1,
            "user2": game.user2,
            "user1_letters": game.user1_letters,
            "user2_letters": game.user2_letters,
            "game_board": game.game_board,
            "turn_order": game.turn_order,
            "created_at": game.created_at.isoformat(),
            "updated_at": game.updated_at.isoformat() if game.updated_at else None,
        }), 200
    except Exception as e:
        logger.error(f"Oyuna devam etme sırasında hata: {e}", exc_info=True)
        return jsonify({"error": "Oyuna devam etme sırasında bir hata oluştu."}), 500


def parse_db_json(data, default=None):
    """Veritabanından gelen JSON string'i güvenle parse eder."""
    if default is None: default = {}
    if isinstance(data, (dict, list)): return data  # Zaten parse edilmişse
    if isinstance(data, str):
        try:
            return json.loads(data)
        except json.JSONDecodeError:
            return default
    return default


def check_hand_balance(hand, min_vowels=2, min_consonants=2):
    vowels = 0
    consonants = 0
    for letter in hand:
        if letter == '*':
            continue
        if letter.upper() in TURKISH_VOWELS:
            vowels += 1
        else:
            consonants += 1
    return vowels >= min_vowels and consonants >= min_consonants


def distribute_letters_from_json(initial_letter_pool_dict, max_redraw_attempts=5):
    if not isinstance(initial_letter_pool_dict, dict):
        logger.error("distribute_letters_from_json: initial_pool_dict sözlük değil!")
        return {"user1_letters": "[]", "user2_letters": "[]", "remaining_letters": "{}"}

    # 1. Harf torbasını oluştur
    letter_bag = []
    for letter, data in initial_letter_pool_dict.items():
        count = data.get('count', 0)
        if isinstance(count, int) and count > 0:
            letter_bag.extend([letter] * count)

    if len(letter_bag) < 14:  # İki oyuncuya yetecek kadar harf yoksa dağıtma
        logger.warning(f"Yeterli harf yok! Torbada {len(letter_bag)} harf kaldı.")
        # Belki kalanları dağıt? Şimdilik boş dönelim veya hata verelim.
        pool_json = json.dumps(initial_letter_pool_dict)
        return {"user1_letters": "[]", "user2_letters": "[]", "remaining_letters": pool_json}

    # 2. User 1 için Dengeli El Çekmeye Çalışma
    user1_letters = []
    hand_size = 7
    attempts = 0
    while attempts < max_redraw_attempts:
        attempts += 1
        logger.debug(f"User 1 için harf çekme denemesi: {attempts}")
        if len(letter_bag) < hand_size: break  # Torbada yeterli harf kalmadıysa döngüden çık

        random.shuffle(letter_bag)  # Her denemede torbayı tekrar karıştır
        temp_hand1 = letter_bag[:hand_size]  # İlk 7 harfi al (henüz torbadan çıkarma)

        # Dengeli mi diye kontrol et (örn: en az 2 sesli, 2 sessiz)
        if check_hand_balance(temp_hand1, min_vowels=2, min_consonants=2):
            user1_letters = temp_hand1  # Dengeli ise bu eli kullan
            logger.info(f"User 1 için dengeli el bulundu ({attempts}. denemede): {user1_letters}")
            break  # Dengeli el bulundu, döngüden çık
        else:
            logger.debug(f"User 1 için {attempts}. deneme dengesiz: {temp_hand1}")

        # Eğer son deneme ise ve hala dengesizse, son çekileni kullan
        if attempts == max_redraw_attempts:
            logger.warning(
                f"User 1 için {max_redraw_attempts} denemede dengeli el bulunamadı. Son çekilen kullanılıyor: {temp_hand1}")
            user1_letters = temp_hand1

    # Seçilen harfleri torbadan gerçekten çıkar
    final_letter_bag = list(letter_bag)  # Kopya üzerinde çalışalım
    for letter in user1_letters:
        try:
            final_letter_bag.remove(letter)
        except ValueError:
            # Bu durum normalde olmamalı ama olursa logla
            logger.error(
                f"Torbadan harf çıkarılırken hata! Harf: {letter}, User1 Eli: {user1_letters}, Torba Başlangıç: {letter_bag}")
            # Hata durumunda belki işlemi durdurmak gerekir? Şimdilik devam edelim.

    # 3. User 2 için Harf Çek (Kalan torbadan)
    user2_letters = []
    random.shuffle(final_letter_bag)  # Kalan torbayı karıştır
    for _ in range(hand_size):
        if final_letter_bag:
            drawn_letter = final_letter_bag.pop()
            user2_letters.append(drawn_letter)
        else:
            break  # Torba bitti

    # 4. Kalan Harf Sayılarını Güncelle
    updated_letter_pool = json.loads(json.dumps(initial_letter_pool_dict))  # Derin kopya
    # User 1'in çektiği harfleri azalt
    for letter in user1_letters:
        if letter in updated_letter_pool:
            updated_letter_pool[letter]['count'] = max(0, updated_letter_pool[letter]['count'] - 1)
        else:
            logger.warning(f"Update Pool (User1): Harf '{letter}' havuzda yok?")
    # User 2'nin çektiği harfleri azalt
    for letter in user2_letters:
        if letter in updated_letter_pool:
            updated_letter_pool[letter]['count'] = max(0, updated_letter_pool[letter]['count'] - 1)
        else:
            logger.warning(f"Update Pool (User2): Harf '{letter}' havuzda yok?")

    # 5. Sonucu JSON string olarak hazırla
    result = {
        "user1_letters": user1_letters,
        "user2_letters": user2_letters,
        "remaining_letters": updated_letter_pool
    }
    logger.info(f"Harf dağıtımı tamamlandı. User1: {len(user1_letters)}, User2: {len(user2_letters)}")
    return result


def draw_new_letters(remaining_letters_dict, player_hand_list, count_to_draw):
    if count_to_draw <= 0:
        return player_hand_list, remaining_letters_dict

    try:
        if not isinstance(remaining_letters_dict, dict):
            logger.error("draw_new_letters: remaining_letters_dict sözlük değil!")
            return player_hand_list, remaining_letters_dict

        letter_bag = []
        for letter, data in remaining_letters_dict.items():
            count = data.get('count', 0)
            if isinstance(count, int) and count > 0:
                letter_bag.extend([letter] * count)

        if not letter_bag:  # Çekilecek harf yoksa
            return player_hand_list, remaining_letters_dict  # Güncel dict'i döndür

        random.shuffle(letter_bag)
        actual_draw_count = min(count_to_draw, len(letter_bag))
        drawn_letters = []

        if actual_draw_count > 0:
            drawn_letters = letter_bag[:actual_draw_count]
            logger.info(f"Yeni harfler çekildi ({actual_draw_count} adet): {drawn_letters}")
        else:  # Çekilecek harf kalmadıysa (min ile yakalandı)
            logger.info("Torbada çekilecek harf kalmadı (draw_new_letters).")

        # Kalan harf sayılarını güncellemek için kopya al
        final_remaining_dict = json.loads(json.dumps(remaining_letters_dict))  # Hızlı derin kopya

        for letter in drawn_letters:
            if letter in final_remaining_dict:
                final_remaining_dict[letter]['count'] = max(0, final_remaining_dict[letter]['count'] - 1)

            else:
                logger.warning(f"Draw New: Çekilen harf '{letter}' havuzda yok?")

        new_hand = player_hand_list + drawn_letters

        return new_hand, final_remaining_dict

    except Exception as e:
        logger.error(f"draw_new_letters hata: {e}", exc_info=True)
        return player_hand_list, remaining_letters_dict


class PlacementValidationResult:  # Geçici Tanım
    def __init__(self, status, message, validWords=None, invalidWord=None):
        self.status = status;
        self.message = message;
        self.validWords = validWords;
        self.invalidWord = invalidWord


class ValidationStatus:  # Geçici Tanım
    Ok = 'Ok';
    InvalidWord = 'InvalidWord';
    InvalidPlacement = 'InvalidPlacement';
    InvalidAxis = 'InvalidAxis';
    NoTilesPlaced = 'NoTilesPlaced'


class FoundWord:  # Geçici Tanım
    pass  # Gerçek tip tanımı word-checker'dan gelmeli


def checkWordPlacement_server(placed_tiles, committed_board, dictionary_set) -> PlacementValidationResult:
    logger.warning("Uyarı: Gerçek checkWordPlacement_server fonksiyonu implemente edilmedi!")
    # TODO: Gerçek Scrabble doğrulama mantığını (eksen, bağlantı, merkez, cross-words, sözlük) burada implemente et.
    # Şimdilik basitçe geçerli varsayalım (test için):
    words = [{"word": "".join(t['letter'] for t in placed_tiles) or "TEST",
              "path": [{'row': t['row'], 'col': t['col']} for t in placed_tiles]}]
    return PlacementValidationResult(status=ValidationStatus.Ok, message="OK (Placeholder)", validWords=words)


def _pos_to_a1(row, col):
    if row < 0 or row >= 15 or col < 0 or col >= 15: return None
    return f"{chr(ord('A') + col)}{row + 1}"


# --- Ana Skor Hesaplama Fonksiyonu ---
def calculate_score_server_side(
        valid_words: list,  # [{'word': 'ELMA', 'path': [{'row': 7, 'col': 7}, ...]}, ...]
        placed_tiles: list,  # [{'letter': 'E', 'row': 7, 'col': 8, 'is_blank': False}, ...]
        reward_board: dict,  # {"A1": "TW", ...}
        letter_scores: dict,  # {"A": 1, "B": 3, ...}
        block_bonuses_flag: bool  # True ise bonuslar uygulanmaz
) -> int:
    total_score = 0
    if not valid_words: return 0

    placed_coords_set = {f"{tile['row']}_{tile['col']}" for tile in placed_tiles}
    placed_tiles_map = {f"{t['row']}_{t['col']}": t for t in placed_tiles}  # Hızlı erişim için

    all_word_scores_debug = []  # Detaylı loglama için

    for word_info in valid_words:
        word_score = 0
        word_multiplier = 1
        path = word_info.get('path', [])
        word_str = word_info.get('word', '')
        logger.debug(f"Scoring Word: '{word_str}'")

        current_word_calculation = []  # Harf bazında hesaplama detayı

        for pos in path:
            row, col = pos['row'], pos['col']
            coord_key_rc = f"{row}_{col}"
            coord_key_a1 = _pos_to_a1(row, col)

            # Harfi bul - Önce bu tur konulanlara bak, sonra tahtaya (valid_words yolu doğruysa sorun olmaz)
            letter = '?'  # Varsayılan
            placed_tile_info = placed_tiles_map.get(coord_key_rc)
            is_newly_placed = bool(placed_tile_info)
            if placed_tile_info:
                letter = placed_tile_info['letter'].upper()
            else:
                # Eğer valid_words path'inde bu tur konulmayan taş varsa,
                # bu taşın harfini committed_board'dan almak gerekir.
                # Ancak valid_words sadece yeni oluşan kelimeleri içermeli.
                # Şimdilik kelime string'inden alalım (checkWordPlacement'ın doğruluğuna güvenir)
                try:
                    path_index = path.index(pos)  # Pozisyonun index'ini bul
                    letter = word_str[path_index].upper()
                except (ValueError, IndexError):
                    logger.error(f"Skorlama: Path/Word uyumsuzluğu! Word:'{word_str}', Pos:{pos}")
                    continue  # Bu harfi atla

            is_blank = placed_tile_info.get('is_blank', False) if placed_tile_info else False
            base_letter_score = 0 if is_blank else letter_scores.get(letter, 0)  # Joker 0 puan

            letter_multiplier = 1
            current_word_multiplier_bonus = 1  # Bu harfin bastığı kare kelime bonusu veriyor mu?

            # Bonusları SADECE bu turda yerleştirilen taşlar için uygula (ve eğer bloklanmadıysa)
            if not block_bonuses_flag and is_newly_placed and coord_key_a1 and coord_key_a1 in reward_board:
                bonus = reward_board[coord_key_a1]
                if bonus == 'DL':
                    letter_multiplier = 2
                elif bonus == 'TL':
                    letter_multiplier = 3
                elif bonus == 'DW':
                    current_word_multiplier_bonus = 2
                elif bonus == 'TW':
                    current_word_multiplier_bonus = 3
                elif bonus == '★':
                    current_word_multiplier_bonus = 2  # Merkez = DW
                logger.debug(
                    f"  Bonus Applied: {coord_key_a1} ({letter}) New:{is_newly_placed} Bonus:{bonus} LM:{letter_multiplier} WM:{current_word_multiplier_bonus}")

            word_multiplier *= current_word_multiplier_bonus  # Kelime çarpanlarını biriktir
            current_tile_score = base_letter_score * letter_multiplier
            word_score += current_tile_score
            current_word_calculation.append(f"{letter}({base_letter_score}x{letter_multiplier})")

        final_word_score = word_score * word_multiplier
        debug_str = f"'{word_str}': ({'+'.join(current_word_calculation)}) x {word_multiplier} = {final_word_score}"
        logger.debug(debug_str)
        all_word_scores_debug.append(debug_str)
        total_score += final_word_score

    # Bingo bonusu
    if len(placed_tiles) == 7:
        logger.info("Bingo bonusu (+50) eklendi.")
        total_score += 50

    logger.info(f"Hesaplanan Toplam Skor: {total_score}. Detay: {'; '.join(all_word_scores_debug)}")
    return max(0, total_score)


@socketio.on('connect')
def handle_connect():
    logger.info(f"Client bağlandı: {request.sid}")
    emit('connection_success', {'message': 'Sunucuya başarıyla bağlandınız!'})


@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f"Client bağlantısı kesildi: {request.sid}")
    # TODO: Odalardan otomatik çıkarma veya oyuncu durumu güncelleme eklenebilir.


@socketio.on('join_game')
def handle_join_game(data):
    game_id = data.get('game_id')
    if game_id:
        room = str(game_id)
        join_room(room)
        logger.info(f"Client {request.sid}, '{room}' odasına katıldı.")
        emit('joined_room', {'room': room, 'message': f"'{room}' odasına katıldınız."},
             to=request.sid)  # Sadece katılan client'a gönder
    else:
        logger.warning(f"Client {request.sid} geçersiz 'join_game' isteği.")


@socketio.on('leave_game')
def handle_leave_game(data):
    game_id = data.get('game_id')
    if game_id:
        room = str(game_id)
        leave_room(room)
        logger.info(f"Client {request.sid}, '{room}' odasından ayrıldı.")
    else:
        logger.warning(f"Client {request.sid} geçersiz 'leave_game' isteği.")


if __name__ == '__main__':
    with app.app_context():
        try:
            db.create_all()
            logger.info("Veritabanı tabloları kontrol edildi/oluşturuldu.")
        except Exception as create_err:
            logger.error(f"Veritabanı tabloları oluşturulurken hata: {create_err}")

    logger.info("SocketIO Sunucusu başlatılıyor...")
    # Geliştirme için debug=True, use_reloader=True
    # Production için debug=False, use_reloader=False ve Gunicorn gibi bir WSGI sunucusu
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=True, log_output=True)
