package util 
{
	import flash.display.Sprite;
	import flash.net.FileReference;
	import flash.utils.ByteArray;
	/**
	 * ...
	 * @author S
	 */
	public class DAECompressor extends Sprite
	{
		[Embed(source = "../../lib/model/model.dae", mimeType = "application/octet-stream")]
		private var model:Class;
		
		public function DAECompressor() {
			var modelByteArray:ByteArray = new model;
			modelByteArray.deflate();
			
			var file:FileReference = new FileReference();
			file.save(modelByteArray, "model");
		}
		
	}

}