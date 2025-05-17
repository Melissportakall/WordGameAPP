import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableWithoutFeedback,
  TouchableOpacity,
  PanResponder,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { checkWords } from './word-checker';
import { Alert } from 'react-native';


const BASE_URL = 'http://192.168.0.11:5000';

const BOARD_SIZE = 15;
const screenWidth = Dimensions.get('window').width;
const sampleLetters = ['A', 'K', 'L', 'E', 'R', 'İ', 'M'];
const letterColors = ['#f44336', '#9c27b0', '#3f51b5', '#009688', '#ff9800', '#795548', '#607d8b'];

// Matris renk değerleri
const MATRIX_COLORS = {
  1: '#ADD8E6', // 2x Letter
  2: '#FFC0CB', // 3x Word
  3: '#90EE90', // 2x Word
  4: '#A52A2A', // 3x Letter
  0: '#FFFFFF', // Normal
};

// Matris değer dağılımı
const MATRIX_VALUES = [
  [2, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2],
  [0, 3, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 3, 0],
  [0, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 0, 3, 0, 0],
  [1, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 1],
  [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
  [0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0],
  [0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0],
  [2, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 2],
  [0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0],
  [0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0],
  [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
  [1, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 1],
  [0, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 0, 3, 0, 0],
  [0, 3, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 3, 0],
  [2, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2],
];

const NewGameScreen = () => {
  const { game_id, user_id, opponent_name, duration } = useLocalSearchParams();
  const [userLetters, setUserLetters] = useState<string[]>([]);
  const [gameData, setGameData] = useState<any>(null);
  const [opponentId, setOpponentId] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [board, setBoard] = useState(Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill('')));
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  const cellRefs = useRef({});
  const selectedRefs = useRef({});
  const trashRef = useRef(null);
  const cellPositions = useRef({});
  const trashPosition = useRef(null);
  const letterCounter = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [opponentUsername, setOpponentUsername] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isMyTurn, setIsMyTurn] = useState<boolean>(true);
  const [turnMessage, setTurnMessage] = useState<string>('');
  const cellSize = zoomed ? 42 : screenWidth * 0.98 / BOARD_SIZE;
  const boardSize = cellSize * BOARD_SIZE;
  const [pendingDragItem, setPendingDragItem] = useState(null);

  const handleDoubleTap = () => setZoomed(prev => !prev);



  const navigation = useNavigation();

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
                user_id,
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


  //EKLEDİKLERİM BURDA BASLIYOR 
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  useEffect(() => {
    if (game_id && user_id) {
      console.log("game_id:", game_id);
      initializeGame();
    }
  }, [game_id, user_id]);
  const initializeGame = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/game/${game_id}/initialize`);
      console.log("Backend'den gelen yanıt:", response.data);
  
      const data = response.data;
  
      let letters;
      if (String(user_id) === String(data.user1)) {
        letters = Array.isArray(data.user1_letters) ? data.user1_letters : JSON.parse(data.user1_letters);
      } else {
        letters = Array.isArray(data.user2_letters) ? data.user2_letters : JSON.parse(data.user2_letters);
      }
  
      setUserLetters(letters); // ✅ burada harfleri state'e atıyoruz
  
      // sıra kimde kontrolü
      if (String(data.turn_order) === String(user_id)) {
        setIsMyTurn(true);
        setTurnMessage('Sıra sende');
      } else {
        setIsMyTurn(false);
        setTurnMessage('Sıra rakipte');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error("Backend'den gelen hata:", error.response.data);
      } else if (error.request) {
        console.error("Backend'e istek gönderilemedi:", error.request);
      } else {
        console.error("Axios isteği sırasında hata:", error.message);
      }
    }
  };
  


  const fetchUsernames = async (myId: string, oppId: string) => {
    try {
      const myRes = await axios.get(`${BASE_URL}/user/${myId}`);
      const oppRes = await axios.get(`${BASE_URL}/user/${oppId}`);

      setUsername(myRes.data.username);
      setOpponentUsername(oppRes.data.username);
    } catch (error) {
      console.error('Kullanıcı adları alınırken hata:', error);
    }
  };

  const startTimer = () => {
    if (!duration) return;

    let seconds: number = 0;
    if (duration === '2min') seconds = 120;
    else if (duration === '5min') seconds = 300;
    else if (duration === '12h') seconds = 12 * 60 * 60;
    else if (duration === '24h') seconds = 24 * 60 * 60;

    setTimeLeft(seconds);

    const timerInterval = setInterval(() => {
      if (!isMyTurn) {
        clearInterval(timerInterval);
        return;
      }
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  };

  const isMoveValid = () => {
    const tempHand = [...userLetters];
    for (let tile of placedTiles) {
      const letter = tile.letter.toUpperCase();
      const index = tempHand.indexOf(letter);
      if (index === -1) {
        return false; // elinde bu harf yok
      }
      tempHand.splice(index, 1); // harfi tüket
    }
    return true;
  };
  
  const handleEndTurn = async () => {
    const foundWords = checkWords(board);

    if (foundWords.length === 0) {
      Alert.alert('Kelimeniz Yanlış', 'Geçerli bir kelime oluşturamadınız.');
      return;
    }

    
    
    console.log('✅ Geçerli Kelimeler:');
    foundWords.forEach(word => {
      console.log(`Kelime: ${word.word}, Yol: ${JSON.stringify(word.path)}`);
    });

    const placedTiles = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        if (board[i][j] !== '') {
          placedTiles.push({ row: i, col: j, letter: board[i][j], is_blank: false });
        }
      }
    }
    console.log("İstek verisi:", {
      game_id,
      user_id,
      placed_tiles: placedTiles,
      score_gained: 10,
    });
    
    try {
      const response = await axios.post(`${BASE_URL}/submit-move`, {
        game_id,
        user_id: user_id,
        placed_tiles: placedTiles,
        score_gained: 10, // Şu anda sabit puan verdik
      });

      const data = response.data;
      // Backend'den dönen verilerle ekranı güncelle
    setBoard((prevBoard) => {
      const updatedBoard = [...prevBoard];
      Object.entries(data.game_board).forEach(([key, value]) => {
        const [row, col] = key.split('_').map(Number);
        updatedBoard[row][col] = value;
      });
      return updatedBoard;
    });
      

      console.log('Hamle başarılı:', response.data);

      // 🔥 BURAYA ALERT EKLİYORUZ 🔥
      Alert.alert('Başarılı', 'Hamleniz başarıyla gönderildi!');

      setUserLetters(data.new_player_letters);
    setIsMyTurn(data.next_turn === user_id);
    setTurnMessage(data.next_turn === user_id ? 'Sıra sende' : 'Sıra rakipte');

    Alert.alert('Başarılı', 'Hamleniz başarıyla gönderildi!');
  } catch (error) {
    console.error('Hamle gönderilirken hata:', error);
    Alert.alert('Hata', 'Hamle gönderilirken bir hata oluştu.');
  }
  };




  //EKLEDİKLERİM BURDA BİTİYOR


  const handleLetterSelect = (letter: string) => {
    setSelectedLetter(letter); // Seçilen harfi state'e kaydet
  };
  
  const handleCellPress = (row: number, col: number) => {
    if (!isMyTurn || !selectedLetter || board[row][col] !== '') return; // Eğer sıra kullanıcıda değilse veya hücre doluysa işlem yapma
    const updatedBoard = [...board];
    updatedBoard[row][col] = selectedLetter; // Seçilen harfi matrise yerleştir
    setBoard(updatedBoard);
    setSelectedLetter(null); // Harf yerleştirildikten sonra seçimi temizle
  };
  
  

  
  
  
  const renderBoard = () =>
    Array.from({ length: BOARD_SIZE }).map((_, rowIndex) => (
      <View key={rowIndex} style={styles.row}>
        {Array.from({ length: BOARD_SIZE }).map((_, colIndex) => {
          const key = `${rowIndex}-${colIndex}`;
          const value = MATRIX_VALUES[rowIndex][colIndex];
          const color = MATRIX_COLORS[value] || '#FFFFFF';
  
          return (
            <TouchableOpacity
              key={key}
              onPress={() => handleCellPress(rowIndex, colIndex)} // Hücreye tıklanıldığında harfi yerleştir
              style={[
                styles.cell,
                {
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: color,
                },
              ]}
            >
              {value !== 0 && (
                <Text style={styles.multiplierText}>
                  {value === 1 && '2xL'}
                  {value === 2 && '3xW'}
                  {value === 3 && '2xW'}
                  {value === 4 && '3xL'}
                  {value === 5 && '⭐'}
                </Text>
              )}
              <Text style={styles.cellText}>{board[rowIndex][colIndex]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    ));
  
  
  
  
    return (
      <View style={styles.container}>
        {/* Kullanıcı isimleri üstte */}
        <View style={styles.header}>
          <Text style={styles.usernameText}>{username || 'Sen'}</Text>
          <Text style={styles.usernameText}>{opponentUsername || 'Rakip'}</Text>
        </View>
    
        {/* Geri butonu */}
<TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
  <Ionicons name="arrow-back" size={24} color="black" />
</TouchableOpacity>
    
        {/* Sıra bilgisi */}
        <View style={styles.turnMessageContainer}>
          <Text style={styles.turnMessageText}>{turnMessage}</Text>
        </View>
    
        {/* Sayaç */}
        <View style={styles.timerContainer}>
          {isMyTurn ? (
            <Text style={styles.timerText}>Kalan Süre: {formatTime(timeLeft)}</Text>
          ) : (
            <Text style={styles.timerText}>Sıra Bekleniyor...</Text>
          )}
        </View>
    
        {/* Hamleyi Bitir Butonu */}
        <TouchableOpacity style={styles.endTurnButton} onPress={handleEndTurn}>
          <Text style={styles.endTurnText}>Hamleyi Bitir</Text>
        </TouchableOpacity>
    
        {/* Oyun tahtası */}
        <TouchableWithoutFeedback onPress={handleDoubleTap}>
          <ScrollView
            contentContainerStyle={styles.scrollArea}
            horizontal={zoomed}
            scrollEnabled={zoomed}
            maximumZoomScale={3}
            minimumZoomScale={1}
            pinchGestureEnabled
          >
            <View style={[styles.boardContainer, { width: boardSize, height: boardSize }]}>
              {renderBoard()}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
    
        {/* Kullanıcı harfleri */}
        <View style={styles.letterSection}>
          <Text style={styles.letterHeader}>Harfler</Text>
          <View style={styles.letterRow}>
            {userLetters && userLetters.length > 0 ? (
              userLetters.map((letter, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleLetterSelect(letter)} // Harfe tıklanıldığında seç
                  style={[styles.letterTile, { backgroundColor: letterColors[index % letterColors.length] }]}
                >
                  <Text style={styles.letterText}>{letter}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text>Harfler yükleniyor...</Text>
            )}
          </View>
    
          {/* Seçilen harf */}
          <View style={styles.selectedRow}>
            {selectedLetter ? (
              <Text style={styles.selectedLetterText}>Seçilen Harf: {selectedLetter}</Text>
            ) : (
              <Text style={styles.selectedLetterText}>Harf Seçin</Text>
            )}
          </View>
        </View>
      </View>
    );}

    const styles = StyleSheet.create({
      container: {
        flex: 1,
        backgroundColor: '#f5f5f5', // Arka plan rengi: açık gri
        paddingBottom: 20,
      },
      header: {
        padding: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#4CAF50', // Üst bar rengi: yeşil
        borderBottomLeftRadius: 15,
        borderBottomRightRadius: 15,
      },
      usernameText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff', // Beyaz yazı rengi
      },
      backButton: {
        position: 'absolute',
        top: 10, // Butonun ekranın üst kısmına olan mesafesi
        right: 10, // Butonun ekranın sağ tarafına olan mesafesi
        zIndex: 1000, // Butonun diğer öğelerin üstünde görünmesini sağlar
        padding: 10,
        backgroundColor: '#fff', // Beyaz arka plan
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
      },
      turnMessageContainer: {
        alignItems: 'center',
        marginVertical: 10,
        padding: 10,
        backgroundColor: '#e8f5e9', // Hafif yeşil arka plan
        borderRadius: 10,
        marginHorizontal: 20,
      },
      turnMessageText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#388E3C', // Yeşil yazı rengi
      },
      timerContainer: {
        alignItems: 'center',
        marginVertical: 20,
      },
      timerText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333', // Koyu gri yazı rengi
      },
      endTurnButton: {
        backgroundColor: '#FF5722', // Turuncu buton
        marginHorizontal: 50,
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
      },
      endTurnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
      },
      scrollArea: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 10,
      },
      boardContainer: {
        alignSelf: 'center',
        backgroundColor: '#fff', // Beyaz arka plan
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
      },
      row: {
        flexDirection: 'row',
      },
      cell: {
        borderWidth: 1,
        borderColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        backgroundColor: '#f9f9f9', // Hücre arka planı: açık gri
      },
      cellText: {
        fontSize: 14,
        color: '#000', // Siyah yazı rengi
        fontWeight: 'bold',
      },
      multiplierText: {
        position: 'absolute',
        top: 2,
        right: 2,
        fontSize: 10,
        fontWeight: 'bold',
        color: '#000', // Siyah yazı rengi
      },
      letterSection: {
        paddingHorizontal: 20,
        marginTop: 10,
        backgroundColor: '#fff', // Beyaz arka plan
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
      },
      letterHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
        color: '#333', // Koyu gri yazı rengi
      },
      letterRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
      },
      letterTile: {
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 10,
        margin: 5,
        backgroundColor: '#4CAF50', // Yeşil arka plan
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
      },
      letterText: {
        color: '#fff', // Beyaz yazı rengi
        fontSize: 18,
        fontWeight: 'bold',
      },
      selectedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        justifyContent: 'center',
      },
      selectedLetterText: {
        color: '#4CAF50', // Yeşil yazı rengi
        fontSize: 16,
        fontWeight: 'bold',
      },
    });

export default NewGameScreen;