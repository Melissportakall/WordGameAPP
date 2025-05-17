import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableWithoutFeedback,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  // BackHandler // Opsiyonel
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { checkWordPlacement, FoundWord, PlacementValidationResult, ValidationStatus } from './word-checker';
import LetterSelectionModal from './letter-select-screen';
// ------------------------------------------

// --- Type Definitions ---
interface LetterData { count: number; score: number; }
interface RemainingLetters { [key: string]: LetterData; }
interface RewardBoard { [key: string]: string; }
interface BoardState { [key: string]: string; }

interface PlayerLetter {
  id: string;
  letter: string;
  isBlank?: boolean;
  score?: number;
}

interface PlacedTile extends PlayerLetter {
  row: number;
  col: number;
}

// --- Constants ---
const BASE_URL = 'http://192.168.0.11:5000';
const BOARD_SIZE = 15;
const CENTER_ROW = 7;
const CENTER_COL = 7;
const screenWidth = Dimensions.get('window').width;
const letterColors = ['#f44336', '#9c27b0', '#3f51b5', '#009688', '#ff9800', '#795548', '#607d8b'];

// --- Component ---
const GameScreen = () => {
  const router = useRouter();
  // Sadece game_id'yi alıyoruz, diğerleri fetch edilecek
  const { game_id } = useLocalSearchParams<{ game_id?: string }>();

  // --- State Variables ---
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [opponentUsername, setOpponentUsername] = useState<string>('');
  const [myScore, setMyScore] = useState<number>(0);
  const [opponentScore, setOpponentScore] = useState<number>(0);
  const [boardState, setBoardState] = useState<BoardState>({});
  const [visualBoard, setVisualBoard] = useState<(string | null)[][]>(
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
  );
  const [playerLetters, setPlayerLetters] = useState<PlayerLetter[]>([]);
  const [currentMoveTiles, setCurrentMoveTiles] = useState<PlacedTile[]>([]);
  const [selectedLetterInfo, setSelectedLetterInfo] = useState<PlayerLetter | null>(null);
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
  const [turnOrder, setTurnOrder] = useState<string | null>(null);
  const [turnMessage, setTurnMessage] = useState<string>('Oyun yükleniyor...');
  const [rewardBoardData, setRewardBoardData] = useState<RewardBoard | null>(null);
  const [remainingLettersData, setRemainingLettersData] = useState<RemainingLetters | null>(null);
  const [isLetterSelectionModalVisible, setIsLetterSelectionModalVisible] = useState<boolean>(false);
  const [blankTilePlacementInfo, setBlankTilePlacementInfo] = useState<{ row: number; col: number; id: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  // --- Refs ---
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null); // BU ARTIK KALDIRILACAK
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // --- Constants derived from State/Props ---
  const cellSize = zoomed ? 42 : screenWidth * 0.9 / BOARD_SIZE;
  const boardSize = cellSize * BOARD_SIZE;

  // --- Helper Functions ---
  const getBoardKey = (row: number, col: number): string => `${row}_${col}`;
  const handleDoubleTap = () => setZoomed(prev => !prev); // Düzeltme 3: Fonksiyon eklendi
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Güvenli JSON Parse (Backend string dönerse diye)
  const parseJsonArray = (jsonString: string | any): any[] => {
      if (Array.isArray(jsonString)) return jsonString; // Zaten array ise direkt döndür
      if (typeof jsonString === 'string' && jsonString.length > 0) {
          try {
              const parsed = JSON.parse(jsonString);
              return Array.isArray(parsed) ? parsed : [];
          } catch (e) { console.error("JSON parse error (Array):", e); return []; }
      } return [];
  };
   const parseJsonObject = (jsonString: string | any): object => {
       if (typeof jsonString === 'object' && jsonString !== null && !Array.isArray(jsonString)) return jsonString; // Zaten obje ise
       if (typeof jsonString === 'string' && jsonString.length > 0) {
           try { return JSON.parse(jsonString) || {}; }
           catch (e) { console.error("JSON parse error (Object):", e); return {}; }
       } return {};
   };

   const fetchUsernames = useCallback(async (myId: string, oppId: string) => {
    if (!myId || !oppId) return;
    try {
      const [myRes, oppRes] = await Promise.all([
        axios.get(`${BASE_URL}/user/${myId}`), // <span> kaldırıldı
        axios.get(`${BASE_URL}/user/${oppId}`)  // <span> kaldırıldı
      ]);      setUsername(myRes.data.username || 'Sen');
      const oppName = oppRes.data.username || 'Rakip';
      setOpponentUsername(oppName);
      // Sıra mesajını burada set et (turnOrder state'ine göre)
      //setTurnMessage(turnOrder === myId ? 'Sıra sende' : `Sıra ${oppName}'da`);
    } catch (error) { console.log(error) }
  }, [turnOrder]);

  useEffect(() => {
    // Gerekli state'ler yüklendikten sonra mesajı ayarla
    if (!isLoading && userId) { // userId'nin de set edildiğinden emin olalım
        const oppNameDisplay = opponentUsername || 'Rakip';
        setTurnMessage(isMyTurn ? 'Sıra sende' : `Sıra ${oppNameDisplay}'da`);
    }
  }, [isMyTurn, opponentUsername, isLoading, userId]);

  const updateGameState = useCallback((gameState: any, currentUserId: string | null) => {
    if (!gameState || !currentUserId) return;
    console.log("[updateGameState] Updating state with:", gameState);

    try {
        const fetchedBoardState = parseJsonObject(gameState.game_board) as BoardState;
        setBoardState(fetchedBoardState);
        setRewardBoardData(parseJsonObject(gameState.reward_punishment_board) as RewardBoard);
        const fetchedRemainingLetters = parseJsonObject(gameState.remaining_letters) as RemainingLetters;
        setRemainingLettersData(fetchedRemainingLetters);

        const currentTurnOrder = String(gameState.turn_order);
        // Sıra değişikliğini sadece farklıysa yap (gereksiz render önlemek için)
        if (turnOrder !== currentTurnOrder) setTurnOrder(currentTurnOrder);
        const myTurnNow = currentTurnOrder === currentUserId;
         if (isMyTurn !== myTurnNow) setIsMyTurn(myTurnNow);

        // Rakip adını al veya state'ten kullan
        let currentOpponentUsername = opponentUsername;
         const user1Id = String(gameState.user1);
         const user2Id = String(gameState.user2);
         let opponentUserId : string | null = null;

        let fetchedPlayerLettersRaw: string[] = [];

        if (currentUserId === user1Id) {
            setMyScore(gameState.score1); setOpponentScore(gameState.score2);
            fetchedPlayerLettersRaw = parseJsonArray(gameState.user1_letters);
            opponentUserId = user2Id;
        } else if (currentUserId === user2Id) {
            setMyScore(gameState.score2); setOpponentScore(gameState.score1);
            fetchedPlayerLettersRaw = parseJsonArray(gameState.user2_letters);
            opponentUserId = user1Id;
        }

         // Opponent ID state'ini güncelle (ilk yüklemede veya değiştiyse)
         if(opponentUserId && opponentId !== opponentUserId) {
             setOpponentId(opponentUserId);
             // Eğer kullanıcı adı henüz çekilmediyse çek
             if (!opponentUsername) {
                  fetchUsernames(currentUserId, opponentUserId);
                  // Username hemen gelmeyeceği için mesajı geçici ayarla
                  setTurnMessage(myTurnNow ? 'Sıra sende' : `Sıra Rakipte`);
             } else {
                 setTurnMessage(myTurnNow ? 'Sıra sende' : `Sıra ${opponentUsername}'da`);
             }
         } else if (opponentUsername) {
             setTurnMessage(myTurnNow ? 'Sıra sende' : `Sıra ${opponentUsername}'da`);
         }

         // Son hamle bilgilerini işle (WebSocket'ten gelirse)
      if (gameState.last_move_info) {
        const info = gameState.last_move_info;
        // Sadece RAKİBİN hamlesi ise alert göster (kendi hamlemiz için zaten HTTP yanıtında gösterdik)
        if (info.player_id !== currentUserId) {
            console.log("Opponent's Last Move Info:", info);
            if (info.triggered_traps && info.triggered_traps.length > 0) {
                Alert.alert("Rakip Tuzağa Düştü!", info.triggered_traps.map((t:any) => t.message).join('\n'));
            }
            if (info.earned_rewards && info.earned_rewards.length > 0) {
                 Alert.alert("Rakip Ödül Kazandı!", info.earned_rewards.map((r:any) => r.message).join('\n'));
            }
             if (info.extra_turn_used) {
                   Alert.alert("Rakip Ekstra Hamle Kullandı!", "Sıra tekrar rakipte.");
             }
             if (info.hand_discarded) {
                  Alert.alert("Rakibin Eli Değişti!", "Rakip harf kaybı tuzağına bastı.");
             }
        } else {
             // Kendi hamlemizin WebSocket güncellemesi, alert göstermeye gerek yok.
             // Sadece state'lerin senkronize olmasını sağlar.
             console.log("Received own move update via WebSocket for sync.");
        }
      }

      const newPlayerLetters = fetchedPlayerLettersRaw.map((letter: string, index: number) => {
        const isActuallyBlank = letter === "Blank" || letter === "*";
        return {
            id: `hand-<span class="math-inline">\{index\}\-</span>{isActuallyBlank ? 'blank' : letter}-${Date.now()}`,
            letter: isActuallyBlank ? '*' : letter.toUpperCase(),
            isBlank: isActuallyBlank,
            score: isActuallyBlank ? 0 : (fetchedRemainingLetters?.[letter.toUpperCase()]?.score ?? undefined)
        };
      });

        // GÜNCELLEME MANTIĞI: Sadece sıra bize gelmediyse VEYA sıra bize geldi ama henüz taş oynamadıysak güncelle
        if (!myTurnNow || (myTurnNow && currentMoveTiles.length === 0) ) {
             console.log("[DEBUG] Updating playerLetters via updateGameState.");
             setPlayerLetters(newPlayerLetters);
        } else {
             console.log("[DEBUG] Skipping playerLetters update in updateGameState (my turn, tiles placed).");
        }

        // Görsel tahtayı her zaman güncelle (rakibin hamlesini görmek için)
        updateVisualBoard(fetchedBoardState, myTurnNow ? currentMoveTiles : []);

        // TODO: Oyun bitiş kontrolü...
         setErrorMessage(null); // Başarılı güncelleme sonrası hatayı temizle

    } catch (error) {
         console.error("updateGameState içinde hata:", error);
         setErrorMessage("Oyun durumu işlenirken hata.");
    }
  }, [opponentId, opponentUsername, turnOrder, isMyTurn, currentMoveTiles.length, fetchUsernames]);

  // --- Game State Fetching & Initialization ---
  const initializeGame = useCallback(async (currentUserId: string) => {
    if (!game_id || isFetching) return;
    console.log(`[GameScreen] Initialize/Fetch game: ${game_id}, User: ${currentUserId}`);
    //setIsLoading(true);
    setIsFetching(true);

    try {
      const response = await axios.get(`${BASE_URL}/game/${game_id}/initialize`);
      const gameState = response.data;
      if (!gameState || !gameState.id) throw new Error("Sunucudan geçerli oyun durumu alınamadı.");

      // State güncellemeleri
      const fetchedBoardState = parseJsonObject(gameState.game_board) as BoardState;
      setBoardState(fetchedBoardState);
      setRewardBoardData(parseJsonObject(gameState.reward_punishment_board) as RewardBoard);
      const fetchedRemainingLetters = parseJsonObject(gameState.remaining_letters) as RemainingLetters;
      setRemainingLettersData(fetchedRemainingLetters);

      const currentTurnOrder = String(gameState.turn_order);
      if (turnOrder !== currentTurnOrder) setTurnOrder(currentTurnOrder); // Sadece değiştiyse set et
      const myTurnNow = currentTurnOrder === currentUserId;
      if (isMyTurn !== myTurnNow) setIsMyTurn(myTurnNow);
      // Turn message fetchUsernames içinde set edilecek

      const user1Id = String(gameState.user1);
      const user2Id = String(gameState.user2);
      let opponentUserId: string | null = null;
      let fetchedPlayerLettersRaw: string[] = [];
      if (currentUserId === user1Id) {
        fetchedPlayerLettersRaw = parseJsonArray(gameState.user1_letters);
      } else if (currentUserId === user2Id) {
        fetchedPlayerLettersRaw = parseJsonArray(gameState.user2_letters);
      }

      if (currentUserId === user1Id) {
        setMyScore(gameState.score1);
        setOpponentScore(gameState.score2);
        fetchedPlayerLettersRaw = parseJsonArray(gameState.user1_letters); // Parse et
        opponentUserId = user2Id;
      } else if (currentUserId === user2Id) {
        setMyScore(gameState.score2);
        setOpponentScore(gameState.score1);
        fetchedPlayerLettersRaw = parseJsonArray(gameState.user2_letters); // Parse et
        opponentUserId = user1Id;
      } else {
         console.error("Mevcut kullanıcı oyunun oyuncusu değil!");
         setErrorMessage("Bu oyunun oyuncusu değilsiniz.");
         return;
      }

      if (opponentUserId && opponentId !== opponentUserId) {
        setOpponentId(opponentUserId);
        fetchUsernames(currentUserId, opponentUserId);
      } else if (opponentUsername) {
          setTurnMessage(myTurnNow ? 'Sıra sende' : `Sıra ${opponentUsername}'da`);
      }


      const newPlayerLetters = fetchedPlayerLettersRaw.map((letter: string, index: number) => {
        const isActuallyBlank = letter === "Blank" || letter === "*";

        // Kontrol sonucunu logla (DEBUG)
        console.log(`Letter: '${letter}', isBlank check result: ${isActuallyBlank}`);

        const letterForState = isActuallyBlank ? '*' : letter.toUpperCase();
        const score = isActuallyBlank ? 0 : (fetchedRemainingLetters?.[letter.toUpperCase()]?.score ?? undefined);

        return {
            id: `hand-${index}-${letterForState}-${Date.now()}`,
            letter: letterForState,
            isBlank: isActuallyBlank,
            score: score
        };
    });

      // Düzeltilmiş Güncelleme Mantığı: State'i güncelle, ANCAK sıra bizdeyse VE zaten harf yerleştirmeye başladıysak DOKUNMA
      console.log("[DEBUG] Generated newPlayerLetters:", newPlayerLetters);
      console.log("[DEBUG] Conditions before set: isMyTurn:", myTurnNow, "currentMoveTiles length:", currentMoveTiles.length);
      if (!(myTurnNow && currentMoveTiles.length > 0)) {
           console.log("[DEBUG] UPDATING playerLetters state.");
           setPlayerLetters(newPlayerLetters);
      } else {
           console.log("[DEBUG] SKIPPING playerLetters update because it's my turn and tiles are already placed on board temporarily.");
      }

      updateVisualBoard(fetchedBoardState, myTurnNow ? currentMoveTiles : []);

      // TODO: Oyun bitiş kontrolü
      setErrorMessage(null);

    } catch (error: any) { /* ... Hata yönetimi ... */
        console.error('[GameScreen] Oyun durumu alınırken HATA:', error.response?.status, error.response?.data || error.message);
        setErrorMessage('Oyun durumu alınamadı: ' + (error.response?.data?.message || 'Sunucu hatası'));
    } finally {
      setIsFetching(false);
      // (isLoading) setIsLoading(false); // İlk yüklemeyi de bitir
    }
  }, [game_id, isMyTurn, turnOrder, opponentId, opponentUsername, currentMoveTiles.length]); // Bağımlılıklar güncellendi


  useEffect(() => {
    if (userId && game_id) {
        socketRef.current?.disconnect();

        // Yeni bağlantı oluştur
        // Not: Geliştirme sırasında localhost/IP kullanırken adresin doğru olduğundan emin ol.
        // Emulator/cihazdan erişim için 10.0.2.2 veya LAN IP adresi gerekebilir.
        // BASE_URL'in WebSocket için de geçerli olduğunu varsayıyoruz.
        console.log(`Connecting socket to ${BASE_URL}`);
        socketRef.current = io(BASE_URL, {
            reconnectionAttempts: 3, // Tekrar bağlanma denemesi
            timeout: 10000,         // Bağlantı zaman aşımı
        });

        // Bağlantı başarılı olunca odaya katıl
        socketRef.current.on('connect', () => {
            console.log('Socket connected! ID:', socketRef.current?.id);
            console.log(`Emitting join_game for room: ${game_id}`);
            socketRef.current?.emit('join_game', { game_id: game_id });
        });

        // Sunucudan oyun güncellemesi gelince state'i güncelle
        socketRef.current.on('game_updated', (updatedGameState) => {
            console.log('Received game_updated event via WebSocket');
            // Gelen veriyle state'i güncellemek için updateGameState'i kullan
            // Hamleyi kendimiz yaptıysak bu güncelleme gereksiz olabilir ama
            // genellikle senkronizasyon için yine de yapmak iyidir.
            updateGameState(updatedGameState, userId);

             // Eğer sıra bize geçtiyse ve biz geçici hamle yapıyorsak, bu hamleleri temizle
             // (Çünkü rakip oynamış, bizim geçici hamlemiz artık geçersiz)
              const myTurnNow = String(updatedGameState.turn_order) === userId;
              if(myTurnNow && currentMoveTiles.length > 0) {
                   console.warn("Turn received, clearing local temporary move.");
                   setPlayerLetters(prev => [...prev, ...currentMoveTiles.map(t => ({id: t.id, letter: t.letter, isBlank: t.isBlank, score: t.score}))]);
                   setCurrentMoveTiles([]);
                   setSelectedLetterInfo(null);
                   // Görsel tahtayı da sadece kalıcı harflerle güncelle
                   updateVisualBoard(parseJsonObject(updatedGameState.game_board) as BoardState, []);
              }
        });

        // Diğer olay dinleyicileri (opsiyonel)
        socketRef.current.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            // TODO: Kullanıcıya bilgi verilebilir veya tekrar bağlanmaya çalışılabilir.
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
             setErrorMessage("Oyun sunucusuna bağlanılamadı. İnternetinizi kontrol edin.");
        });

        socketRef.current.on('joined_room', (data) => {
              console.log(`Successfully joined room: ${data.room}`);
        });

        // Cleanup: Component kaldırıldığında bağlantıyı kes
        return () => {
            console.log('Disconnecting socket...');
            socketRef.current?.emit('leave_game', { game_id: game_id }); // Odadan ayrıl (opsiyonel)
            socketRef.current?.disconnect();
        };
    }
  }, [userId, game_id, updateGameState]); 


  // --- Initialization Effect ---
  useEffect(() => {
    let isMounted = true;
    const loadUserAndGame = async () => {
      setIsLoading(true);
      const storedUserId = await AsyncStorage.getItem('user_id');
      console.log(`[GameScreen] Stored User ID: ${storedUserId}`);
      if (!isMounted) return;
      if (storedUserId && game_id) {
        setUserId(storedUserId);
        await initializeGame(storedUserId); // await eklendi
      } else {
         if (!storedUserId) setErrorMessage("Kullanıcı ID bulunamadı.");
         if (!game_id) setErrorMessage("Oyun ID bulunamadı.");
         setIsLoading(false);
      }
      // setIsLoading(false); // initializeGame içindeki finally'de yapılacak
    };
    loadUserAndGame();
    return () => { isMounted = false; /* ... socket disconnect ... */ };
  }, [game_id, initializeGame]);


  // --- Board Update Logic ---
  const updateVisualBoard = (committedTiles: BoardState, currentTurnTiles: PlacedTile[]) => {
      const newVisualBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
      // Önce kalıcı harfleri yerleştir
      Object.keys(committedTiles).forEach(key => {
          const [row, col] = key.split('_').map(Number);
          if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
              newVisualBoard[row][col] = committedTiles[key];
          }
      });
      // Sonra bu turda yerleştirilenleri (üzerine yazabilir)
      currentTurnTiles.forEach(tile => {
           if (tile.row >= 0 && tile.row < BOARD_SIZE && tile.col >= 0 && tile.col < BOARD_SIZE) {
              newVisualBoard[tile.row][tile.col] = tile.letter;
           }
      });
      setVisualBoard(newVisualBoard);
  };


  // --- Click-to-Place Logic ---
  const handleLetterSelect = (letterInfo: PlayerLetter) => {
    if (!isMyTurn) return;
    console.log("Selected letter:", letterInfo.letter);
    setSelectedLetterInfo(letterInfo); // Tüm objeyi sakla (ID, isBlank vb. için)
  };

  const handleCellPress = (row: number, col: number) => {
    const key = getBoardKey(row, col);

    console.log(`handleCellPress çağrıldı: Satır=${row}, Sütun=${col}, Key=${key}`);
    console.log("Seçili Harf Bilgisi (handleCellPress başı):", JSON.stringify(selectedLetterInfo));
    console.log(`Kontroller: isMyTurn=${isMyTurn}, isSubmitting=${isSubmitting}`);

    if (!isMyTurn || isSubmitting) {
      console.log(">>> Guard Engeli: Sıra bende değil veya hamle gönderiliyor.");
      return; // Sıra bende değilse veya gönderim varsa çık
    }

    // 2. Guard: Harf seçili mi?
    if (!selectedLetterInfo) {
        console.log(">>> Guard Engeli: Harf seçilmemiş.");
        // Bu log görünüyorsa, handleLetterSelect düzgün çalışmıyor olabilir.
        return; // Harf seçili değilse çık
    }

    // 3. Guard: Hücre kalıcı olarak dolu mu?
    if (boardState[key]) {
        console.log(`>>> Guard Engeli: Hücre (${key}) kalıcı olarak dolu ('${boardState[key]}').`);
        return; // Kalıcı harf varsa çık
    }

    // 4. Guard: Hücre bu tur geçici olarak dolduruldu mu?
    const tempOccupiedTile = currentMoveTiles.find(t => t.row === row && t.col === col);
    if (tempOccupiedTile) {
        console.log(`>>> Guard Engeli: Hücre (${key}) geçici olarak dolu ('${tempOccupiedTile.letter}').`);
        // İPUCU: Belki bu hücreye tekrar tıklayınca harfi ele geri almak istersin?
        // handlePlacedTilePress(tempOccupiedTile); // Bu satır eklenirse, konulan harfe tekrar basınca ele döner.
        return; // Geçici harf varsa çık
    }

    // --- Tüm Guard'lar Geçildi ---
    console.log("Guard kontrolleri geçildi.");
    console.log("Seçili harf JOKER mi kontrol ediliyor? isBlank:", selectedLetterInfo.isBlank); // isBlank değerini logla


    if (selectedLetterInfo.isBlank) { // Eğer seçilen harf Joker ise
      console.log(`Blank tile placement initiated for cell: ${row}, ${col}`);
      // Yerleştirme bilgisini ve jokerin ID'sini state'e kaydet
      setBlankTilePlacementInfo({ row: row, col: col, id: selectedLetterInfo.id });
      // Modal'ı görünür yap
      setIsLetterSelectionModalVisible(true);
      // Seçili harfi SIFIRLAMA, modal kapanınca yapılacak
      // setSelectedLetterInfo(null); // <-- ŞİMDİLİK KALDIR
    } else {
        // Normal harf yerleştirme (önceki gibi)
        console.log(`Placing letter ${selectedLetterInfo.letter} at ${row}, ${col}`);
        const newTile: PlacedTile = { ...selectedLetterInfo, row, col };
        const nextMoveTiles = [...currentMoveTiles, newTile];
        setCurrentMoveTiles(nextMoveTiles);
        setPlayerLetters(prev => prev.filter(l => l.id !== selectedLetterInfo!.id));
        updateVisualBoard(boardState, nextMoveTiles);
        setSelectedLetterInfo(null); // Normal harf konulunca seçimi sıfırla
    }
  };

  const handleModalClose = () => {
    setIsLetterSelectionModalVisible(false);
    setBlankTilePlacementInfo(null); // Yerleştirme bilgisini temizle
    setSelectedLetterInfo(null); // Harf seçimini burada sıfırla
    console.log("Letter selection modal closed.");
  };

  const handleModalLetterSelect = (chosenLetter: string) => {
    console.log(`Letter selected from modal: ${chosenLetter}`);
    if (blankTilePlacementInfo) { // Hangi joker için seçildiğini kontrol et
        const { row, col, id } = blankTilePlacementInfo;

        // Yeni PlacedTile objesini oluştur
        const newTile: PlacedTile = {
            id: id, // Orijinal joker taşının ID'si
            letter: chosenLetter.toUpperCase(), // Seçilen harf
            row: row,
            col: col,
            isBlank: true, // Joker olduğunu belirt
            score: 0       // Puanı 0
        };

        // State güncellemeleri (handleCellPress'in içindekine benzer)
        const nextMoveTiles = [...currentMoveTiles, newTile];
        setCurrentMoveTiles(nextMoveTiles);
        setPlayerLetters(prev => prev.filter(l => l.id !== id)); // ID'ye göre joker taşını elden çıkar
        updateVisualBoard(boardState, nextMoveTiles); // Görsel tahtayı güncelle
    } else {
        console.error("Blank placement info is missing!");
    }

    // Modal'ı kapat ve seçimi sıfırla
    handleModalClose();
  };

  // Tahtaya konulan harfe tıklayıp ele geri alma
  const handlePlacedTilePress = (tileInfo: PlacedTile) => {
      if (!isMyTurn) return;

      console.log(`Returning letter ${tileInfo.letter} from ${tileInfo.row}, ${tileInfo.col} to hand`);

      // Geçici hamlelerden çıkar
      const nextMoveTiles = currentMoveTiles.filter(t => t.id !== tileInfo.id);
      setCurrentMoveTiles(nextMoveTiles);

      // Ele geri ekle
      setPlayerLetters(prev => [...prev, {
          id: tileInfo.id,
          letter: tileInfo.letter,
          isBlank: tileInfo.isBlank,
          score: tileInfo.score
      }]);

      // Görsel tahtayı güncelle
      updateVisualBoard(boardState, nextMoveTiles);
  };



  // --- End Turn Logic ---
  const handleEndTurn = useCallback(async () => {
    // --- KONTROL ÖNCESİ DEĞERLERİ LOGLA ---
    console.log(
      "Guard Check Values:",
      {
          isMyTurn,
          isLoading,
          isSubmitting,
          currentMoveTilesLength: currentMoveTiles.length,
          userId,
          game_id
      }
  );

  // --- GUARD KOŞULU ---
  if (!isMyTurn || isSubmitting || currentMoveTiles.length === 0) {
      console.log(">>> İlk guard koşulu nedeniyle çıkılıyor. isMyTurn:", isMyTurn, "isSubmitting:", isSubmitting, "tiles:", currentMoveTiles.length);
      if (!isMyTurn) Alert.alert("Hata", "Sıra sizde değil.");
      else if (isSubmitting) Alert.alert("Bekleyin", "Önceki hamle hala işleniyor.");
      else if (currentMoveTiles.length === 0) Alert.alert("Hata", "Önce harf yerleştirin.");
      return;
  }

  if (!userId || !game_id) {
      console.log(">>> İkinci guard koşulu nedeniyle çıkılıyor (ID eksik).");
      Alert.alert("Hata", "ID bilgileri eksik.");
      return;
  }

  console.log("Guard kontrolleri geçildi, hamle gönderiliyor...");

    setIsSubmitting(true);

    console.log("Kontroller geçildi, isMyTurn:", isMyTurn);

    // --- 1. Yerleştirme ve Kelime Doğrulama (Yeni Fonksiyon ile) ---
    const validationResult: PlacementValidationResult = checkWordPlacement(
        currentMoveTiles,
        boardState
    );
    console.log("Validation Result:", validationResult);

    // Doğrulama sonucunu kontrol et
    if (validationResult.status !== ValidationStatus.Ok) {
      console.log("Geçersiz hamle durumu!");
      Alert.alert("Geçersiz Hamle", validationResult.message); // Fonksiyondan gelen mesajı göster
      setIsSubmitting(false);
      // Geçersiz hamlede taşları ele geri döndürmek isteyebilirsin:
      setPlayerLetters(prev => [...prev, ...currentMoveTiles.map(t => ({id: t.id, letter: t.letter, isBlank: t.isBlank, score: t.score}))]);
      setCurrentMoveTiles([]);
      updateVisualBoard(boardState, []);
      return; // İşlemi durdur
  }

    // Geçerli kelimeler bulundu
    const foundValidWords: FoundWord[] = validationResult.validWords || [];
    console.log('Doğrulanan Geçerli Kelimeler:', foundValidWords);
    // --- Kelime Kontrol Sonu ---


    // --- 3. Backend Verisi Hazırlama ---
    const moveData = {
      game_id: parseInt(game_id!, 10),
      user_id: parseInt(userId!, 10),
      placed_tiles: currentMoveTiles.map(tile => ({
        letter: tile.letter,
        row: tile.row,
        col: tile.col,
        is_blank: tile.isBlank || false,
      })),
      words_formed: foundValidWords.map(w => w.word),
    };
    console.log("Hamle Gönderiliyor:", moveData);
    // --- Veri Hazırlama Sonu ---

    // --- 4. API İsteği ve Sonrası ---
    try {
      console.log("axios.post çağrılıyor...");
      const response = await axios.post(`${BASE_URL}/submit-move`, moveData);
      const responseData = response.data;
      console.log("Hamle Yanıtı:", responseData);

      setCurrentMoveTiles([]);
      setSelectedLetterInfo(null);

      // Görsel tahtayı güncelle (sadece backend'den gelen kalıcı harflerle - Ws güncellemesi bekleniyor)
      // updateVisualBoard(boardState, []); // Bu satır yerine Ws beklenir

      // Yeni harfleri state'e ata (backend yanıtından gelen)
      const newLetters = responseData.new_player_letters || [];
      setPlayerLetters(newLetters.map((letter: string, index: number) => ({ id: `hand-<span class="math-inline">\{index\}\-</span>{Date.now()}`, letter, isBlank: letter === '*', score: remainingLettersData?.[letter.toUpperCase()]?.score ?? (letter === '*' ? 0 : undefined) })));

       // Sıranın geçtiğini BELİRTMEK için mesajı ve isMyTurn'u hemen güncelleyebiliriz
       // (WebSocket'ten teyit gelmesini beklemeden daha hızlı UI yanıtı için)
       setIsMyTurn(false);
       setTurnOrder(String(responseData.next_turn)); // turnOrder'ı hemen set et
       setTurnMessage(`Sıra ${opponentUsername || 'Rakipte'}`);

      // Alert.alert('Başarılı', 'Hamleniz gönderildi!'); // UI güncellenince anlaşılır

      // Tetiklenen/kazanılanlar için anlık bildirim (Ws gelene kadar)
      if (responseData.triggered_traps && responseData.triggered_traps.length > 0) {
        Alert.alert("Tuzak!", responseData.triggered_traps.map((t:any) => t.message).join('\n'));
      }
      if (responseData.earned_rewards && responseData.earned_rewards.length > 0) {
          Alert.alert("Ödül!", responseData.earned_rewards.map((r:any) => r.message).join('\n'));
      }
      if(responseData.extra_turn_granted) {
            Alert.alert("Ekstra Hamle!", "Sıra tekrar sende!");
            // State'i hemen geri alabiliriz, Ws teyit edecek
            setIsMyTurn(true);
            setTurnOrder(userId);
            setTurnMessage("Sıra sende (Ekstra Hamle!)");
      }

    } catch (error: any) {
        console.error("axios.post HATASI:", error);
        console.error("Hamle gönderme hatası:", error.response?.data || error.message);
        Alert.alert("Hamle Gönderilemedi", error.response?.data?.message || "Sunucuyla iletişim kurulamadı.");
        // Başarısız olursa, yerleştirilen harfleri geri al
        setPlayerLetters(prev => [...prev, ...currentMoveTiles.map(t => ({id: t.id, letter: t.letter, isBlank: t.isBlank, score: t.score}))]);
        setCurrentMoveTiles([]);
        updateVisualBoard(boardState, []); // Görsel tahtayı eski haline getir
    } finally {
      setIsSubmitting(false); // Butonu tekrar aktif et
      // setIsLoading(false); // isSubmitting kullanılıyor
      console.log("handleEndTurn bitti.");
    }
  }, [userId, game_id, isMyTurn, isLoading, isSubmitting, currentMoveTiles, boardState, turnOrder, opponentUsername, remainingLettersData, updateGameState]); // updateGameState eklendi


  // --- Back Button Logic ---
  const handleBackPress = () => {
    Alert.alert(
      'Pes Mi?',
      'Oyununuz aktif oyunlarda mı tutulsun yoksa pes mi ediyorsunuz? Eğer pes ederseniz oyunu karşı taraf kazanacaktır.',
      [
        {
          text: 'Pes Et',
          onPress: async () => {
            try {
              // Pes etme işlemi için backend'e istek gönder
              await axios.post(`${BASE_URL}/leave-game/${game_id}`, {
                userId,
              });
              Alert.alert('Pes Ettiniz', 'Oyun sona erdi ve rakibiniz kazandı.');
              router.push('/home'); // Ana sayfaya yönlendirme
            } catch (error) {
              console.error('Pes etme işlemi sırasında hata:', error);
              Alert.alert('Hata', 'Pes etme işlemi sırasında bir hata oluştu.');
            }
          },
          style: 'destructive', // Kırmızı renkli buton
        },
        {
          text: 'Aktif Oyunda Tut',
          onPress: () => {
            Alert.alert('Oyun Aktif', 'Oyununuz aktif oyunlarınızda tutulacaktır.');
            router.push('/home'); // Ana sayfaya yönlendirme
          },
          style: 'default', // Varsayılan buton
        },
      ],
      { cancelable: true } // Kullanıcı alerti kapatabilir
    );
  };

  // --- Render Functions ---
  const renderBoard = () => {
    return Array.from({ length: BOARD_SIZE }).map((_, rowIndex) => (
      <View key={`row-${rowIndex}`} style={styles.row}>
        {Array.from({ length: BOARD_SIZE }).map((_, colIndex) => {
          const key = getBoardKey(rowIndex, colIndex);
          // Görsel tahtayı kullan
          const displayLetter = visualBoard[rowIndex]?.[colIndex] || null; // visualBoard state'inden oku
          const currentTileOnCell = currentMoveTiles.find(t => t.row === rowIndex && t.col === colIndex);

          // Bonus kare bilgisi (önceki gibi)
          const backendKey = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
          const bonus = rewardBoardData ? rewardBoardData[backendKey] : null;
          let bonusText = '';
          let cellColor = '#f9f9f9'; // Default cell color

          if (bonus) { /* ... Bonus metin ve renklerini ayarla ... */
               if (bonus === 'DL') { bonusText = '2xH'; cellColor = '#ADD8E6'; }
               else if (bonus === 'TL') { bonusText = '3xH'; cellColor = '#FFC0CB';} // Renk düzeltildi
               else if (bonus === 'DW') { bonusText = '2xK'; cellColor = '#90EE90'; }
               else if (bonus === 'TW') { bonusText = '3xK'; cellColor = '#FF6347'; }
               else if (bonus === '★') { bonusText = '★'; cellColor = '#FFD700'; }
          }

          return (
            <TouchableOpacity
              key={key}
              style={[styles.cell, { width: cellSize, height: cellSize, backgroundColor: cellColor }]}
              onPress={() => {
                   // Eğer hücrede bu tur konulan harf varsa ele geri al, yoksa seçili harfi koymayı dene
                   if (currentTileOnCell) {
                       handlePlacedTilePress(currentTileOnCell);
                   } else {
                       handleCellPress(rowIndex, colIndex);
                   }
              }}
              disabled={!isMyTurn || (!!boardState[key] && !currentTileOnCell) } // Sıra bizde değilse VEYA kalıcı harf varsa ve bizim koyduğumuz değilse disable
            >
              {bonusText && !displayLetter && (
                <Text style={styles.multiplierText}>{bonusText}</Text>
              )}
              {displayLetter && (
                 <Text style={styles.cellText}>{displayLetter}</Text>
                 // TODO: Puanı göstermek için:
                 // <Text style={styles.letterScoreInCell}>{remainingLettersData?.[displayLetter.toUpperCase()]?.score ?? 0}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    ));
  };

  const renderPlayerLetters = () => (
    <View style={styles.letterRow}>
        {playerLetters.map((item, index) => (
            <TouchableOpacity
                key={item.id}
                style={[
                    styles.letterTile,
                    // Blank için belki farklı arkaplan?
                    item.isBlank ? styles.blankTile : { backgroundColor: letterColors[index % letterColors.length] },
                    selectedLetterInfo?.id === item.id ? styles.selectedLetterTile : null
                ]}
                onPress={() => handleLetterSelect(item)}
                disabled={!isMyTurn || isSubmitting}
            >
                {/* Blank ise '*' göster, değilse harfi */}
                <Text style={[styles.letterText, item.isBlank && styles.blankLetterText]}>
                    {item.isBlank ? '*' : item.letter}
                </Text>
                {/* Blank puanı 0 olduğu için göstermeye gerek olmayabilir */}
                {!item.isBlank && <Text style={styles.letterScore}>{item.score ?? '?'}</Text>}
            </TouchableOpacity>
        ))}
    </View>
  );

  // --- Main Return ---
  if (isLoading && !opponentId) { // İlk yükleme tamamlanmadıysa göster
      return <View style={styles.loadingContainer}><ActivityIndicator size="large" /></View>;
  }
  if (errorMessage) { return (<View style={styles.loadingContainer}><Text style={styles.errorText}>{errorMessage}</Text><TouchableOpacity onPress={() => router.back()}><Text>Geri Dön</Text></TouchableOpacity></View>); }
  if (gameOver) { return (<View style={styles.container}><Text>Oyun Bitti! Kazanan: {winnerId === userId ? username : opponentUsername}</Text></View>); }

  return (
      // JSX yapısı önceki cevapla aynı, sadece loading/submitting durumları eklendi
      <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
           <View style={styles.playerInfo}><Text style={[styles.usernameText, isMyTurn ? styles.activeTurn : null]}>{username || 'Sen'}</Text><Text style={styles.scoreText}>{myScore}</Text></View>
           <View style={styles.playerInfo}><Text style={[styles.usernameText, !isMyTurn ? styles.activeTurn : null]}>{opponentUsername || 'Rakip'}</Text><Text style={styles.scoreText}>{opponentScore}</Text></View>
      </View>
      {/* Geri Butonu */}
      <TouchableOpacity style={styles.backButton} onPress={handleBackPress}><Ionicons name="arrow-back" size={24} color="black" /></TouchableOpacity>
      {/* Sıra Mesajı */}
      <View style={styles.turnMessageContainer}><Text style={styles.turnMessageText}>{turnMessage}</Text></View>
       {/* Zamanlayıcı */}
       <View style={styles.timerContainer}>
           {isMyTurn ? (<Text style={styles.timerText}>Kalan Süre: {formatTime(timeLeft)}</Text>) : (<Text style={styles.timerText}>Sıra Bekleniyor...</Text>)}
       </View>
      {/* Tahta */}
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <ScrollView contentContainerStyle={styles.scrollArea} horizontal={zoomed} scrollEnabled={zoomed} style={styles.scrollView}>
          <View style={[styles.boardContainer, { width: boardSize, height: boardSize }]}>{renderBoard()}</View>
        </ScrollView>
      </TouchableWithoutFeedback>
      {/* Aksiyon Butonları */}
      <View style={styles.actionButtonsContainer}>
           <TouchableOpacity style={[styles.actionButton, !isMyTurn || currentMoveTiles.length === 0 || isSubmitting ? styles.disabledButton : null]} onPress={handleEndTurn} disabled={!isMyTurn || currentMoveTiles.length === 0 || isSubmitting}><Text style={styles.actionButtonText}>{isSubmitting ? 'Gönderiliyor...' : 'Hamleyi Bitir'}</Text></TouchableOpacity>
           <TouchableOpacity style={[styles.actionButton, !isMyTurn || isSubmitting ? styles.disabledButton : null]} disabled={!isMyTurn || isSubmitting} /* onPress={handlePass} */><Text style={styles.actionButtonText}>Pas</Text></TouchableOpacity>
           <TouchableOpacity style={[styles.actionButton, !isMyTurn || isSubmitting ? styles.disabledButton : null]} disabled={!isMyTurn || isSubmitting} /* onPress={handleExchange} */><Text style={styles.actionButtonText}>Değiştir</Text></TouchableOpacity>
      </View>
       {/* Oyuncu Harfleri */}
       <View style={styles.letterSection}>
          <Text style={styles.letterHeader}>Harflerin ({playerLetters.length})</Text>
          {renderPlayerLetters()}
          <View style={styles.selectedLetterDisplay}>
              <Text style={styles.selectedLetterLabel}>Seçili:</Text>
              {selectedLetterInfo ? (<View style={[styles.letterTile, { width: 35, height: 40, margin: 2, backgroundColor: '#ddd' }]}><Text style={[styles.letterText, { color: '#333' }]}>{selectedLetterInfo.letter}</Text></View>) : (<Text style={styles.selectedLetterPlaceholder}>-</Text>)}
              <TouchableOpacity onPress={() => setSelectedLetterInfo(null)} style={styles.clearSelectionButton}><Ionicons name="close-circle-outline" size={24} color="grey" /></TouchableOpacity>
          </View>
       </View>
       {/* Harf Seçme Modal'ı */}
      <LetterSelectionModal
          visible={isLetterSelectionModalVisible}
          onClose={handleModalClose}
          onSelectLetter={handleModalLetterSelect}
      />
       {/* Yükleme Göstergesi (Submitting için) */}
       {isSubmitting && <View style={styles.submitLoadingOverlay}><ActivityIndicator size="large" color="#fff" /></View> }
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
    // ... (Önceki stiller buraya eklenebilir veya import edilebilir) ...
    // Yeni eklenen stiller:
     container: { flex: 1, backgroundColor: '#f0f0f0' }, // padding bottom kaldırıldı, genel padding scrollview'a verilebilir
     loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
     errorText: { color: 'red', margin: 20, textAlign: 'center' },
     header: { padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#4CAF50', borderBottomLeftRadius: 15, borderBottomRightRadius: 15,},
     playerInfo: { alignItems: 'center', padding: 5, borderRadius: 5, minWidth: 100, },
     usernameText: { fontSize: 16, fontWeight: 'bold', color: '#fff', }, // Boyut küçültüldü
     activeTurn: { textDecorationLine: 'underline', fontWeight: 'bold', },
     scoreText: { fontSize: 16, fontWeight: 'bold', color: '#fff' }, // Boyut küçültüldü
     backButton: { position: 'absolute', top: 50, left: 15, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 20, padding: 5 }, // Konum ve stil ayarlandı
     turnMessageContainer: { alignItems: 'center', marginVertical: 5, padding: 5, backgroundColor: '#e8f5e9', borderRadius: 10, marginHorizontal: 20, },
     turnMessageText: { fontSize: 16, fontWeight: '600', color: '#388E3C', }, // Boyut ayarlandı
     timerContainer: { /* ... */ },
     timerText: { /* ... */ },
     actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '95%', marginVertical: 8, alignSelf: 'center' },
     actionButton: { backgroundColor: '#4CAF50', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 5, elevation: 2, },
     actionButtonText: { color: 'white', fontWeight: 'bold', fontSize: 13, },
     disabledButton: { backgroundColor: '#cccccc', elevation: 0, },
     scrollArea: { alignItems: 'center', justifyContent: 'center', padding: 5, }, // padding eklendi
     scrollView: { width: '100%', maxHeight: Dimensions.get('window').height * 0.45, marginBottom: 5, borderWidth: 1, borderColor: 'lightgrey', backgroundColor: 'white' }, // Yükseklik ve arkaplan ayarlandı
     boardContainer: { flexDirection: 'column', borderWidth: 1, borderColor: '#333', },
     row: { flexDirection: 'row', },
     cell: { borderWidth: 0.5, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center', position: 'relative', },
     cellText: { fontSize: 16, fontWeight: 'bold', color: '#000', },
     multiplierText: { position: 'absolute', fontSize: 9, fontWeight: 'bold', color: 'rgba(0,0,0,0.7)', textAlign: 'center', top: 1, left: 1, right: 1 }, // Konum ve boyut ayarlandı
     letterSection: { width: '95%', alignItems: 'center', backgroundColor: '#fff', padding: 8, borderRadius: 5, alignSelf: 'center', },
     letterHeader: { fontSize: 15, fontWeight: 'bold', marginBottom: 5, },
     letterRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 5, }, // Alt boşluk azaltıldı
     letterTile: { width: 40, height: 45, borderRadius: 5, justifyContent: 'center', alignItems: 'center', margin: 2, elevation: 2, },
     selectedLetterTile: { // Seçili harf stili
         borderWidth: 2,
         borderColor: '#FFD700', // Altın rengi çerçeve
         elevation: 5,
     },
     letterText: { fontSize: 18, fontWeight: 'bold', color: 'white', },
     letterScore: { fontSize: 9, color: 'white', position: 'absolute', bottom: 1, right: 2, },
     selectedLetterDisplay: { // Seçili harfi gösterme alanı
         flexDirection: 'row',
         alignItems: 'center',
         marginTop: 5,
         padding: 5,
         backgroundColor: '#eee',
         borderRadius: 5,
         minHeight: 45, // letterTile ile aynı yükseklik
     },
     selectedLetterLabel: {
         fontSize: 14,
         color: 'grey',
         marginRight: 5,
     },
     selectedLetterPlaceholder: {
         fontSize: 14,
         color: 'grey',
     },
     clearSelectionButton: {
         marginLeft: 10,
         padding: 5,
     },
     submitLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 100,
    },
    blankTile: {
        backgroundColor: '#e0e0e0',
      },
    blankLetterText: {
      color: '#555',
    },
});

export default GameScreen;