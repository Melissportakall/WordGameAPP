import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HomeScreen = () => {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [username, setUsername] = useState('');
  /*
  useEffect(() => {
    const deleteCookies = async () => {
      await AsyncStorage.clear();
    };
    deleteCookies();
  }, []);*/

  
  useEffect(() => {
    const getUsername = async () => {
      const storedUsername = await AsyncStorage.getItem('username');
      const storedUserId = await AsyncStorage.getItem('user_id');
      if(storedUsername) {
        setUsername(storedUsername);
      }
      if(storedUserId) {
        console.log('userıd almaya calisiyorum');
        console.log('User ID:', storedUserId);
      }
      else {
        console.log('User IDyi alamdim.');
      }
    };
    getUsername();
  }, []);

  const handleLogout = async () => {
    console.log("Logout işlemi başlatıldı...");
    try {
      // Silinecek anahtarları bir dizi içinde belirt
      const keysToRemove = ['user_id', 'username'];
      // AsyncStorage'dan belirtilen anahtarları sil
      await AsyncStorage.multiRemove(keysToRemove);
  
      console.log("AsyncStorage temizlendi (user_id, username).");
  
      // Başarıyla silindikten sonra Login ekranına yönlendir ve geçmişi temizle
      router.replace('/login'); // push yerine replace kullan
  
    } catch (error) {
      console.error("Logout sırasında AsyncStorage hatası:", error);
      Alert.alert("Hata", "Çıkış işlemi sırasında bir sorun oluştu.");
    }
  };

  const handleOptionPress = (duration: string) => {
    setModalVisible(false);
    router.push({
      pathname: '/waiting-new-opponent',
      params: { duration },
    });
  };

  const userInfo = {
    username: username,
    successRate: 0,
    totalGames: 0,
    wonGames: 0,
  };

  const menuItems = [
    {
      id: 1,
      title: 'Yeni Oyun',
      description: 'Yeni bir oyun başlat',
      route: '/new-game',
      color: '#FF9A8B',
      icon: '🎮',
    },
    {
      id: 2,
      title: 'Aktif Oyunlar',
      description: 'Devam eden oyunlarınız',
      route: '/active-game',
      color: '#8BC6EC',
      icon: '⏳',
    },
    {
      id: 3,
      title: 'Biten Oyunlar',
      description: 'Tamamlanan oyunlarınız',
      route: '/completed-games-screen',
      color: '#4CAF50',
      icon: '🏆',
    },
  ];

  const handleMenuPress = async (item) => {
    if (item.id === 2) { // Aktif Oyunlar
      try {
        const storedUserId = await AsyncStorage.getItem('user_id'); // AsyncStorage'dan user_id'yi al
        console.log('handledeki storedUserId:', storedUserId); // Debug için log ekleyin
        if (storedUserId) {
          console.log('Gönderilen User ID:', storedUserId); // Debug için log ekleyin
          router.push({
            pathname: item.route,
            params: { user_id: storedUserId }, // user_id'yi parametre olarak gönder
          });
        } else {
          Alert.alert('Hata', 'Kullanıcı ID bulunamadı.');
        }
      } catch (error) {
        console.error('Kullanıcı ID alınırken hata:', error);
      }
    } else {
      router.push(item.route);
    }
  };


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.userStats}>
            <Text style={styles.username}>{userInfo.username}</Text>
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{userInfo.successRate}%</Text>
                <Text style={styles.statLabel}>Başarı Oranı</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{userInfo.totalGames}</Text>
                <Text style={styles.statLabel}>Toplam Oyun</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{userInfo.wonGames}</Text>
                <Text style={styles.statLabel}>Kazanılan</Text>
              </View>
              <View style={styles.iconColumn}>
                <TouchableOpacity 
                  style={styles.logoutButton}
                  onPress={handleLogout}
                >
                  <Ionicons name="log-out-outline" size={24} color="red" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.settingsButton}
                  onPress={() => router.push('/settings')}
                >
                  <Ionicons name="settings-outline" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>  
      <View style={styles.content}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Hoş Geldiniz!</Text>
          <Text style={styles.subtitle}>Hemen yeni bir oyun başlatın veya devam eden oyunlarınıza göz atın.</Text>
        </View>

        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <TouchableOpacity
            
              key={item.id}
              style={[styles.menuItem, { backgroundColor: item.color }]}
              onPress={() => {
                if (item.id === 1) {
                  setModalVisible(true); // Yeni Oyun seçeneği için modal açılır
                } else {
                  handleMenuPress(item); // Diğer seçenekler için handleMenuPress çağrılır
                }
              }}
            >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuTitle}>{item.title}</Text>
            <Text style={styles.menuDescription}>{item.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Oyun Süresini Seç</Text>
              <Text style={styles.sectionTitle}>Hızlı Oyun</Text>
              <TouchableOpacity style={styles.optionButton} onPress={() => handleOptionPress('TWO_MIN')}>
                <Text style={styles.optionText}>2 Dakika</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionButton} onPress={() => handleOptionPress('FIVE_MIN')}>
                <Text style={styles.optionText}>5 Dakika</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Genişletilmiş Oyun</Text>
              <TouchableOpacity style={styles.optionButton} onPress={() => handleOptionPress('TWELVE_HOUR')}>
                <Text style={styles.optionText}>12 Saat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionButton} onPress={() => handleOptionPress('TWENTYFOUR_HOUR')}>
                <Text style={styles.optionText}>24 Saat</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userStats: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 15,
    borderRadius: 15,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  welcomeSection: {
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#FFF9C4',
    borderRadius: 15,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  menuItem: {
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    width: '48%',
    aspectRatio: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  menuIcon: {
    fontSize: 32,
    marginBottom: 10,
    color: '#fff',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 5,
  },
  menuDescription: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: 15,
    fontWeight: 'bold',
    color: '#444',
  },
  iconColumn: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10, // ikonlar arasında boşluk
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10, // settings ikonu ile araya boşluk
  },
  
  optionButton: {
    backgroundColor: '#2196F3',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  optionText: {
    color: '#fff',
    textAlign: 'center',
  },
  cancelText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 15,
  },
});

export default HomeScreen;