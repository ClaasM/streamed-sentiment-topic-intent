"""
This script
* Loads documents as aggregation of tweets stored in a MongoDB collection
* Cleans up the documents
* Creates a dictionary and corpus that can be used to train an LDA model
* Training of the LDA model is not included but follows:
  lda = models.LdaModel(corpus, id2word=dictionary, num_topics=100, passes=100)
Author: Alex Perrier
https://github.com/alexperrier/datatalks/

Modifications:
* Converted to Python 3.6 (from 2.7)
"""

from collections import defaultdict
from gensim import corpora
from pymongo import MongoClient

from src.streaming import spark_functions

# connect to the MongoDB
db = MongoClient()['thesis-dev']

# Load tweets from db, while filtering out non-english tweets
documents = [tweet['text'] for tweet in db.tweets.find()
             if 'lang' in tweet and tweet['lang'] == 'en']

# Preprocess with the preprocessing function used during streaming
preprocess = spark_functions.preprocessor()
documents = [preprocess(document) for document in documents]

# Tokenize with the same tokenization function used during streaming
# This ensures consistent results
tokenizer = spark_functions.tokenizer()
documents = [tokenizer(document) for document in documents]

# Remove words that only occur once

token_frequency = defaultdict(int)
# count all token
for doc in documents:
    for token in doc:
        token_frequency[token] += 1
# keep words that occur more than once
documents = [[token for token in doc if token_frequency[token] > 1]
             for doc in documents]

# Build a dictionary where for each document each word has its own id
# We stick to the default pruning settings, since they work well.
dictionary = corpora.Dictionary(documents)
dictionary.compactify()
# and save the dictionary for future use
# We use it for the topic model as well as the sentiment model.
dictionary.save('../../data/processed/tweets_stream.dict')

# Build the corpus: vectors with occurence of each word for each document
# convert tokenized documents to vectors
corpus = [dictionary.doc2bow(doc) for doc in documents]

# and save in Market Matrix format
corpora.MmCorpus.serialize('../../data/processed/tweets_stream.mm', corpus)
# (This is only used for the LDA topic model)
