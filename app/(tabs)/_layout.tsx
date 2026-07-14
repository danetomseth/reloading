import { Tabs } from 'expo-router';
import { TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { C } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const signOut = () => Alert.alert('Sign out', 'Sign out of your account?', [
  { text: 'Cancel', style: 'cancel' },
  { text: 'Sign out', style: 'destructive', onPress: () => { supabase.auth.signOut(); } },
]);

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: 'index',      title: 'Home',       icon: 'home-outline' },
  { name: 'rifles',     title: 'Rifles',     icon: 'list-outline' },
  { name: 'reloads',    title: 'Reloads',    icon: 'layers-outline' },
  { name: 'fieldlog',   title: 'Field Log',  icon: 'compass-outline' },
  { name: 'dope',       title: 'Dope',       icon: 'grid-outline' },
  { name: 'ballistics', title: 'Ballistics', icon: 'analytics-outline' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 10 },
        headerStyle: { backgroundColor: C.surface },
        headerTintColor: C.text,
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => (
          <TouchableOpacity onPress={signOut} style={{ marginRight: 16 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="log-out-outline" size={22} color={C.textSoft} />
          </TouchableOpacity>
        ),
      }}
    >
      {tabs.map(t => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={t.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
