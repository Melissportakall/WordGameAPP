import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const BASE_URL = 'http://192.168.0.11:5000'; // Backend IP adresinizi buraya yazın

const ActiveGameScreen = () => {
  const router = useRouter();
  const { user_id } = useLocalSearchParams(); // Parametre olarak gelen user_id'yi al
  const [activeGames, setActiveGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user_id) {
      console.error('Kullanıcı ID eksik!');
      Alert.alert('Hata', 'Kullanıcı ID alınamadı.');
      return;
    }

    fetchActiveGames(user_id);
  }, [user_id]);

  const fetchActiveGames = async (userId: string | string[]) => {
    try {
      const response = await axios.get(`${BASE_URL}/active-games/${userId}`, {
        responseType: 'text', // Düz metin olarak yanıt al
      });
  
      const games = response.data.split("\n").map((line: string) => {
        const parts = line.split(", ");
        const gameId = parts[0].split(": ")[1];
        const opponent = parts[1].split(": ")[1];
        const remainingTime = parts[2].split(": ")[1];
        const gamemode = parts[3].split(": ")[1];
  
        return {
          game_id: gameId,
          opponent: opponent,
          remaining_time: remainingTime,
          gamemode: gamemode,
        };
      });
  
      setActiveGames(games);
    } catch (error) {
      console.log('Aktif oyunlar alınırken hata:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGamePress = (gameId) => {
    router.push({
      pathname: '/game-screen',
      params: { game_id: gameId },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aktif Oyunlar</Text>
      {activeGames.length === 0 ? (
        <Text style={styles.noGamesText}>Aktif oyun bulunamadı.</Text>
      ) : (
        <FlatList
          data={activeGames}
          keyExtractor={(item) => item.game_id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.gameItem}
              onPress={() => handleGamePress(item.game_id)}
            >
              <Text style={styles.gameText}>Rakip: {item.opponent}</Text>
              <Text style={styles.gameText}>Oyun Süresi: {item.remaining_time || 'Belirtilmemiş'}</Text>
              <Text style={styles.gameText}>Oyun Modu: {item.gamemode}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  noGamesText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  gameItem: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  gameText: {
    fontSize: 16,
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ActiveGameScreen;