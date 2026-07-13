import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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
