const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: ['./src/index.js'],
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
	rules: [
      {
		test: /\.css$/i,
		use: ['style-loader', 'css-loader'],
	  },
	  {
		test: /\.(png|svg|jpg|jpeg|gif)$/i,
		loader: 'file-loader',
		options: {
			name: '[path][name].[ext]',
		},
		type: 'asset/resource',
	  }
	]
  },
  plugins: [
	new HtmlWebpackPlugin({
    	filename: 'index.html',
    	template: './src/index.html',
    	title: 'WAIVE Online',
	})
  ]
};
