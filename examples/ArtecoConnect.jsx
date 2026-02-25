import Fields from '@/Components/Forms/Fields';
import useAppStore from '@/Store/store';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import SiteExplorer from './SiteExplorer';
import { backEndUrl } from '@/config';
import { useTranslation } from 'react-i18next';

export default function ArtecoConnect() {
  const { t } = useTranslation();
  const serverInfo = useAppStore((state) => state.server);
  const [formValues, setFormValues] = useState({
    email: serverInfo?.license?.sso_email || '',
    password: serverInfo?.license?.sso_password || '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [loginResponse, setLoginResponse] = useState(null); // Stores the login response
  const [sites, setSites] = useState([]);
  const [hasStoredData, setHasStoredData] = useState(false);
  const addOperation = useAppStore((state) => state.addOperation);
  const removeOperation = useAppStore((state) => state.removeOperation);
  const token = useAppStore((state) => state.token);

  // Check for data stored in localStorage when the component loads
  useEffect(() => {
    const storedData = localStorage.getItem('loginResponse');
    if (storedData) {
      setLoginResponse(JSON.parse(storedData));
      setHasStoredData(true);

      const sites = JSON.parse(storedData).sites;
      setSites(sites);
    }
  }, []);

  useEffect(() => {
    setFormValues({
      email: serverInfo?.license?.sso_email || '',
      password: serverInfo?.license?.sso_password || '',
    });
  }, [serverInfo]);


  const updateSites = () => {
    const storedData = localStorage.getItem('loginResponse');
    if (storedData) {
      const parsedData = JSON.parse(storedData);
      setSites(parsedData.sites);
    }
  };

  const handleChange = (e) => {
    const { field, value } = e;
    const name = field.name;

    setFormValues((prevValues) => {
      const keys = name.split('.');
      if (keys.length === 1) {
        return { ...prevValues, [name]: value };
      }
      return {
        ...prevValues,
        [keys[0]]: {
          ...prevValues[keys[0]],
          [keys[1]]: value,
        },
      };
    });
  };

  const performLogin = async (isRefresh = false) => {
    setIsLoading(true); // Enable loading state
    addOperation({
      id: 'artecoLogin',
      description: isRefresh
        ? t('Refreshing login information from Arteco Global...')
        : t('Fetching server info from Arteco Global...'),
    });

    const body = {
      user_login: formValues.email,
      user_password: formValues.password,
    };
    ///api/v2/server/login-sso

    const loginEndpoint = `${backEndUrl}/api/v2/server/login-sso`;

    try {
      const response = await axios.post(`${loginEndpoint}`, body,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

      console.log(`${isRefresh ? 'Refresh' : 'Login'} Success:`, response.data);

      // Salva la risposta nel localStorage
      localStorage.setItem('loginResponse', JSON.stringify(response.data));

      // Aggiorna lo stato con i dati della risposta
      setLoginResponse(response.data);
      setSites(response.data.sites);
      setHasStoredData(true);
    } catch (error) {
      console.error(`${isRefresh ? 'Refresh Login' : 'Login'} Error:`, error);
    } finally {
      setIsLoading(false); // Disattiva lo stato di loading
      removeOperation('artecoLogin');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await performLogin(); // Esegui il login
  };

  const handleRefreshLogin = async () => {
    await performLogin(true); // Esegui il refresh
  };

  const fields = [
    {
      type: 'emailbox',
      name: 'email',
      descr: t('Email'),
      isRequired: true,
      value: formValues.email,
    },
    {
      type: 'passwordbox',
      name: 'password',
      descr: t('Password'),
      isRequired: true,
      value: formValues.password,
    },
  ];

  const handleLogout = () => {
    localStorage.removeItem('loginResponse');
    setLoginResponse(null);
    setHasStoredData(false);
  };

  if (hasStoredData && loginResponse) {
    console.log('Arteco connect sites:', sites);
    return (
      <div className='arteco-connect-inner'>
        <h3>{t('Logged In')}</h3>
        {sites && sites.length > 0 ? (
          <div className='arteco-connect-sites-container'>
            <SiteExplorer sites={sites} updateSites={updateSites} />
          </div>
        ) : null}
        <div className='arteco-connect-login-actions-connected'>
          <button className='refresh' onClick={handleRefreshLogin} disabled={isLoading}></button>
          <button className='logout' onClick={handleLogout}></button>
        </div>
      </div>
    );
  }

  return (
    <div className='arteco-connect-inner'>
      <h3>{t('Import from Arteco Global')}</h3>
      <form autoComplete='off' className='arteco-connect-login' onSubmit={handleSubmit}>
        <div className='hidden'>
          <Fields fields={fields} onChange={handleChange} shouldValidate={true} />
        </div>
        <div className='arteco-connect-login-actions'>
          <button type='submit' disabled={isLoading}>
            {isLoading ? t('Fetching sites...') : t('Import')}
          </button>
        </div>
      </form>
    </div>
  );
}
