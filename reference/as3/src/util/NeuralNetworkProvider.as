package util 
{
	import flash.utils.ByteArray;
	import lipsync.core.network.NeuralNetwork;
	/**
	 * ...
	 * @author S
	 */
	public class NeuralNetworkProvider
	{
		[Embed(source="../../lib/lipsync/network_image_m", mimeType="application/octet-stream")] public static var networkImageMale:Class;
		[Embed(source="../../lib/lipsync/network_image_f", mimeType="application/octet-stream")] public static var networkImageFemale:Class;
		
		public static function getNetwork():NeuralNetwork {
			var image:ByteArray = new networkImageMale();
			
			var network:NeuralNetwork = new NeuralNetwork();
			network.load(image);
			
			return network;
		}
		
		public static function build(imageClass:Class):NeuralNetwork {
			var image:ByteArray = new imageClass();
			
			var network:NeuralNetwork = new NeuralNetwork();
			network.load(image);
			
			return network;
		}
		
	}
}