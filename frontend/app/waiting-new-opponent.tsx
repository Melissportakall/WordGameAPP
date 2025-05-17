import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter , useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://192.168.0.11:5000';

const WaitingNewOpponent = () => {
  const router = useRouter();
  const { duration } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUserId = async () => {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (storedUserId) {
        setUserId(storedUserId);

        if (duration && storedUserId) {
          findOpponent(storedUserId, duration.toString());
        }
      } else {
        Alert.alert('Hata', 'Kullanıcı bilgisi bulunamadı.');
      }
    };

    getUserId();
  }, [duration]);

  const findOpponent = async (userId: string, gameDuration: string) => {
    try {
      const response = await axios.post(`${BASE_URL}/find-opponent`, {
        user_id: userId,
        game_duration: gameDuration,
      });
  
      if (response.data.opponentFound) {
        // Eşleşme bulunduysa new-game sayfasına yönlendiriyoruz
        router.push({
          pathname: '/game-screen',
          params: {
            game_id: response.data.game_id,
            user_id: userId,
            opponent_id: response.data.opponent_id,
            duration: gameDuration,
          },
        });
      } else {
        setLoading(false);
        Alert.alert('Bilgi', 'Rakip bulunamadı, yeniden deneyin.');
        router.push('/home');
      }
    } catch (error) {
      console.error('Rakip bulma hatası:', error);
      setLoading(false);
      Alert.alert('Hata', 'Rakip bulma işlemi sırasında bir hata oluştu.');
    }
  };
  

  const handleCancel = async () => {
    if (!userId) {
      Alert.alert("Hata", "Kullanıcı kimliği bulunamadı.");
      return;
    }
    try {
      const response = await axios.post(`${BASE_URL}/cancel-find-opponent`, {
        user_id: userId
      });
  
      if (response.data.cancelled) {
        console.log('İptal isteği başarıyla gönderildi.');
        router.push('/home');
      } else {
         Alert.alert('Hata', 'İptal işlemi sunucu tarafından onaylanmadı.');
      }
    } catch (error: any) {
      console.error('İptal etme hatası:', error.response || error.message);
      Alert.alert('Hata', 'Arama iptal edilirken bir sorun oluştu.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.loaderContainer}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={styles.text}>Rakip bekleniyor...</Text>
          </>
        ) : (
          <Text style={styles.text}>Rakip bulunamadı. Yeniden deneyin.</Text>
        )}
      </View>

      <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
        <Text style={styles.cancelText}>İptal</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: 16,
    fontSize: 18,
  },
  cancelButton: {
    backgroundColor: 'red',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default WaitingNewOpponent;
