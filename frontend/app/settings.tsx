import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const SettingsScreen = () => {
  const router = useRouter();

  const settingsItems = [
    {
      id: 1,
      title: 'Bildirimler',
      description: 'Oyun bildirimlerini aç/kapat',
      type: 'switch',
      value: true,
    },
    {
      id: 2,
      title: 'Ses Efektleri',
      description: 'Oyun seslerini aç/kapat',
      type: 'switch',
      value: true,
    },
    {
      id: 3,
      title: 'Karanlık Mod',
      description: 'Uygulama temasını değiştir',
      type: 'switch',
      value: false,
    },
    {
      id: 4,
      title: 'Hesap Ayarları',
      description: 'Profil bilgilerinizi düzenleyin',
      type: 'navigate',
      route: '/account-settings',
    },
    {
      id: 5,
      title: 'Yardım ve Destek',
      description: 'Sıkça sorulan sorular ve iletişim',
      type: 'navigate',
      route: '/help',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Ayarlar</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {settingsItems.map((item) => (
          <View key={item.id} style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              <Text style={styles.settingDescription}>{item.description}</Text>
            </View>
            {item.type === 'switch' ? (
              <Switch
                value={item.value}
                onValueChange={() => {}}
                trackColor={{ false: '#E0E0E0', true: '#4CAF50' }}
                thumbColor="#fff"
              />
            ) : (
              <TouchableOpacity
                onPress={() => router.push(item.route)}
                style={styles.navigateButton}
              >
                <Ionicons name="chevron-forward" size={24} color="#4CAF50" />
              </TouchableOpacity>
            )}
          </View>
        ))}
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
    backgroundColor: '#4CAF50',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  navigateButton: {
    padding: 8,
  },
});

export default SettingsScreen; 