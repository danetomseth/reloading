import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, isDark } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; title: string; icon: IconName; iconOn: IconName; header?: boolean }[] = [
  { name: 'index',      title: 'Home',       icon: 'home-outline',      iconOn: 'home', header: false },
  { name: 'rifles',     title: 'Rifles',     icon: 'locate-outline',    iconOn: 'locate' },
  { name: 'reloads',    title: 'Loads',      icon: 'layers-outline',    iconOn: 'layers' },
  { name: 'fieldlog',   title: 'Field log',  icon: 'clipboard-outline', iconOn: 'clipboard' },
  { name: 'ballistics', title: 'Ballistics', icon: 'analytics-outline', iconOn: 'analytics' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: isDark ? '#000000' : C.card, borderTopColor: C.line, borderTopWidth: StyleSheet.hairlineWidth },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 11 },
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTintColor: C.text,
        headerTitleAlign: 'left',
        headerTitleStyle: { fontFamily: F.bold, fontSize: 30, color: C.text },
      }}
    >
      {tabs.map(t => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            headerShown: t.header !== false,
            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? t.iconOn : t.icon} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
