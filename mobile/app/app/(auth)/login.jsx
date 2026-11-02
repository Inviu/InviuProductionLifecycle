import { Button } from '@/components/Button';
import { TextInputField } from '@/components/TextInputField';
import { useAuth } from '@/context/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      if (login(username, password)) {
        setUsername('');
        setPassword('');
      } else {
        Alert.alert('Login Failed', 'Invalid credentials. Try Admin/Admin');
      }
      setIsLoading(false);
    }, 500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>INVUI</Text>

        </View>

        <View style={styles.form}>
          <TextInputField
            label="Username"
            placeholder="Enter username"
            value={username}
            onChangeText={setUsername}
          />

          <View style={styles.passwordFieldContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.passwordTextInput}
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholderTextColor="#CCCCCC"
              />
              <TouchableOpacity
                style={styles.eyeIconButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#0066CC"
                />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.hint}>
            Demo credentials: Admin / Admin
          </Text>

          <Button
            title={isLoading ? 'Logging in...' : 'Login'}
            onPress={handleLogin}
            disabled={isLoading}
            variant="primary"
          />
        </View>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  keyboardAvoidView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0066CC',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    paddingTop: 24,
  },
  hint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 8,
    marginBottom: 16,
  },
  passwordFieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 8,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingRight: 12,
  },
  passwordTextInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333333',
  },
  eyeIconButton: {
    padding: 8,
  },
});
