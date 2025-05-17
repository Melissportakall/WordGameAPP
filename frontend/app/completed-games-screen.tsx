// CompletedGamesScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
// useNavigation yerine expo-router'dan useRouter kullanalım (daha tutarlı olur)
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// TODO: BASE_URL'i doğru ayarladığından emin ol
const BASE_URL = 'http://192.168.0.11:5000';

// --- Yardımcı Fonksiyonlar ---
const getResultIcon = (result: 'win' | 'lose' | 'draw' | string | null) => {
  switch (result) {
    case 'win':
      return <Ionicons name="trophy-outline" size={24} color="#4CAF50" />; // İkonları outline yapalım
    case 'lose':
      return <Ionicons name="close-circle-outline" size={24} color="#F44336" />;
    case 'draw':
      return <Ionicons name="remove-circle-outline" size={24} color="#FF9800" />;
    default:
      return <Ionicons name="help-circle-outline" size={24} color="#9E9E9E" />; // Bilinmeyen durum için
  }
};

// --- Component ---
const CompletedGamesScreen = () => {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  // Statik veri yerine state kullan
  const [completedGames, setCompletedGames] = useState<any[]>([]); // Tipi daha belirgin yapabiliriz
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Kullanıcı ID'sini al
  useEffect(() => {
    const getUserId = async () => {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (storedUserId) {
        setUserId(storedUserId);
      } else {
        console.error('Kullanıcı ID bulunamadı!');
        setError('Giriş yapmış kullanıcı bulunamadı.');
        Alert.alert('Hata', 'Kullanıcı bilgisi alınamadı.');
        setLoading(false);
        // Belki Login ekranına yönlendir?
        // router.replace('/login');
      }
    };
    getUserId();
  }, []);

  // 2. Kullanıcı ID'si alınınca oyunları çek
  useEffect(() => {
    if (userId) {
      fetchCompletedGames(userId);
    }
  }, [userId]); // userId değiştiğinde (ilk alındığında) çalışır

  // API'den biten oyunları çekme fonksiyonu
  const fetchCompletedGames = async (currentUserId: string) => {
    setLoading(true);
    setError(null); // Yeni istekte hatayı temizle
    console.log(`Workspaceing completed games for user: ${currentUserId}`);
    try {
      const response = await axios.get(`${BASE_URL}/completed-games/${currentUserId}`);
      // Backend text değil JSON döneceği için responseType'a gerek yok ve parse etmeye gerek yok
      console.log("Completed games response:", response.data);
      if (Array.isArray(response.data)) {
         setCompletedGames(response.data);
      } else {
         // Backend boş liste [] dönmeli, string değil. Ama güvenlik için kontrol.
         setCompletedGames([]);
         console.warn("Backend'den dizi formatında yanıt gelmedi.");
      }

    } catch (error: any) {
      console.error('Biten oyunlar alınırken hata:', error.response?.data || error.message || error);
      setError('Biten oyunlar yüklenirken bir sorun oluştu.');
      Alert.alert('Hata', 'Biten oyunlar alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  // FlatList için renderItem fonksiyonu (küçük iyileştirmelerle)
  const renderItem = ({ item }: { item: any }) => ( // item tipini belirginleştirebiliriz
    <View style={styles.card}>
      <View style={styles.leftSection}>
        <Text style={styles.name}>{item.opponentName || 'Bilinmeyen Rakip'}</Text>
        <Text style={styles.score}>Sen: {item.userScore}</Text>
        <Text style={styles.score}>Rakip: {item.opponentScore}</Text>
        {/* Opsiyonel: Tarih */}
        {item.date && <Text style={styles.dateText}>{item.date}</Text>}
      </View>
      <View style={styles.iconSection}>{getResultIcon(item.result)}</View>
    </View>
  );

  // --- Render ---

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (error) {
     return (
        <View style={styles.loadingContainer}>
             <Ionicons name="cloud-offline-outline" size={64} color="#9E9E9E" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => userId && fetchCompletedGames(userId)} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Tekrar Dene</Text>
            </TouchableOpacity>
             <TouchableOpacity style={styles.backButtonSimple} onPress={() => router.back()}>
                 <Text style={styles.retryButtonText}>Geri</Text>
             </TouchableOpacity>
        </View>
     );
  }

  return (
    <View style={styles.container}>
      {/* Geri butonu için useRouter kullanmak daha iyi */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back-circle-outline" size={32} color="#333" />
      </TouchableOpacity>

      <Text style={styles.title}>Biten Oyunlar</Text>

      {completedGames.length === 0 ? (
        <View style={styles.centeredMessage}>
             <Ionicons name="file-tray-outline" size={48} color="#9E9E9E" />
            <Text style={styles.noGamesText}>Henüz biten oyununuz yok.</Text>
        </View>
      ) : (
        <FlatList
          data={completedGames}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()} // ID'yi string yap
          contentContainerStyle={styles.list}
          // İsteğe bağlı: Yenileme kontrolü
          // refreshing={loading}
          // onRefresh={() => userId && fetchCompletedGames(userId)}
        />
      )}
    </View>
  );
};

// --- Stiller (Mevcut stiller + eklemeler) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F3F4', paddingTop: 30, paddingHorizontal: 20 },
  backButton: { position: 'absolute', top: 40, left: 15, zIndex: 10, padding: 5 }, // Biraz aşağı aldık
  title: { fontSize: 24, fontWeight: 'bold', marginTop: 60, marginBottom: 20, textAlign: 'center', color: '#333' },
  list: { paddingBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3, },
  leftSection: { flex: 1, marginRight: 10 }, // İkon için boşluk
  name: { fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#333' },
  score: { fontSize: 14, color: '#666', marginBottom: 2 },
  dateText: { fontSize: 12, color: '#999', marginTop: 4 }, // Tarih stili
  iconSection: { marginLeft: 10, justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  centeredMessage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noGamesText: { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 20 },
  errorText: { fontSize: 16, color: 'red', textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5, marginTop: 10 },
  retryButtonText: { color: 'white', fontWeight: 'bold' },
  backButtonSimple: { marginTop: 15, padding: 10 }
});

export default CompletedGamesScreen;