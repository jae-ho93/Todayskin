import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { getSession } from '../src/lib/session';
import { colors } from '../src/theme';

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    getSession().then((user) => {
      setHasSession(user !== null);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.sage} />
      </View>
    );
  }

  return <Redirect href={hasSession ? '/(tabs)' : '/onboarding'} />;
}
