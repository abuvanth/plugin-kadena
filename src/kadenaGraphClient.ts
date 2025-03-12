import pkg from '@apollo/client';
const { ApolloClient, InMemoryCache, gql } = pkg;


const getClient = (network:string) => {
       if(network==='mainnet01'){
       return new ApolloClient({
            uri: 'https://graph.kadena.network/graphql',
            cache: new InMemoryCache()
          });
       }
       else{
        return new ApolloClient({
            uri: 'https://graph.testnet.kadena.network/graphql',
            cache: new InMemoryCache()
          });
       }
}

// Define the GraphQL query for fungible chain accounts
const MY_QUERY = gql`
  query MyQuery($accountName: String!, $fungibleName: String!) {
    fungibleChainAccounts(
      accountName: $accountName
      fungibleName: $fungibleName
    ) {
      balance
      chainId
    }
  }
`;

// Define the GraphQL query for fetching reserve with variables
const FETCH_ONCHAIN_QUERY = gql`
  query FetchReserve($chainId: String!, $code: String!) {
    pactQuery(
      pactQuery: {chainId: $chainId, code: $code}
    ) {
      result
      status
      error
    }
  }
`;

// Define the GraphQL query for a single fungible chain account
const FETCH_FUNGIBLE_CHAIN_ACCOUNT_QUERY = gql`
  query MyQuery($accountName: String!, $chainId: String!, $fungibleName: String!) {
    fungibleChainAccount(
      accountName: $accountName
      chainId: $chainId
      fungibleName: $fungibleName
    ) {
      balance
    }
  }
`;

// Function to execute the fungible chain accounts query
export const fetchFungibleChainAccounts = async (accountName: string, fungibleName: string, network:string) => {
  try {
    const client = getClient(network);
    const { data } = await client.query({
      query: MY_QUERY,
      variables: { accountName, fungibleName }
    });
    return data.fungibleChainAccounts;
  } catch (error) {
    console.error('Error fetching fungible chain accounts:', error);
    throw error;
  }
};

// Function to execute the fetch reserve query
export const fetchOnChain = async (chainId: string, code: string, network:string) => {
  try {
    const client = getClient(network);
    const { data } = await client.query({
      query: FETCH_ONCHAIN_QUERY,
      variables: { chainId, code }
    });
    return data.pactQuery;
  } catch (error) {
    console.error('Error fetching reserve:', error);
    throw error;
  }
};

// Function to execute the fungible chain account query
export const fetchFungibleChainAccount = async (accountName: string, chainId: string, fungibleName: string, network:string) => {
  try {
    const client = getClient(network);
    const { data } = await client.query({
      query: FETCH_FUNGIBLE_CHAIN_ACCOUNT_QUERY,
      variables: { accountName, chainId, fungibleName }
    });
    return data.fungibleChainAccount;
  } catch (error) {
    console.error('Error fetching fungible chain account:', error);
    throw error;
  }
};