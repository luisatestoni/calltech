import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NewCallScreen from './src/screens/NewCallScreen';
import CallListScreen from './src/screens/CallListScreen';
import CallDetailScreen from './src/screens/CallDetailScreen';

// Define como as notificações locais são exibidas com o app em primeiro plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type RootStackParamList = {
  CallList: undefined;
  NewCall: undefined;
  CallDetail: { chamadoId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

async function configurarNotificacoes() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('sla-alerts', {
      name: 'Alertas de SLA',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d32f2f',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

export default function App() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    configurarNotificacoes();

    // Ao tocar na notificação de SLA, abre os detalhes do chamado correspondente
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const chamadoId = response.notification.request.content.data?.chamadoId;
      if (typeof chamadoId === 'string' && navigationRef.current?.isReady()) {
        navigationRef.current.navigate('CallDetail', { chamadoId });
      }
    });

    return () => {
      responseSubscription.remove();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName="CallList">
        <Stack.Screen name="CallList" component={CallListScreen} options={{ title: 'Chamados' }} />
        <Stack.Screen name="NewCall" component={NewCallScreen} options={{ title: 'Novo Chamado' }} />
        <Stack.Screen name="CallDetail" component={CallDetailScreen} options={{ title: 'Detalhes do Chamado' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}